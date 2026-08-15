"""Go 服务访问认证。"""
import asyncio
import base64
import json
import time
from contextvars import ContextVar, Token
from typing import Optional

import httpx
from app.config import settings

_TOKEN_REFRESH_SKEW_SECONDS = 60
_cached_token: dict = {"token": None, "expires_at": 0.0}
_token_lock = asyncio.Lock()
_request_customer_token: ContextVar[Optional[str]] = ContextVar(
    "request_customer_token", default=None
)


def _jwt_exp(token: str) -> float:
    """读取 JWT payload 的 exp；这里只用于刷新判断，不代替服务端验签。"""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))
        return float(claims["exp"])
    except (IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return 0.0


def has_request_customer_token() -> bool:
    return _request_customer_token.get() is not None


async def get_go_token(force: bool = False) -> str:
    """登录 NestJS 获取服务账号 JWT，并在到期前自动刷新。"""
    now = time.time()
    token = _cached_token.get("token")
    expires_at = float(_cached_token.get("expires_at") or 0)
    if token and not force and expires_at > now + _TOKEN_REFRESH_SKEW_SECONDS:
        return token

    async with _token_lock:
        now = time.time()
        token = _cached_token.get("token")
        expires_at = float(_cached_token.get("expires_at") or 0)
        if token and not force and expires_at > now + _TOKEN_REFRESH_SKEW_SECONDS:
            return token

        login_url = f"{settings.NESTJS_URL.rstrip('/')}/v1/auth/login"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                login_url,
                json={
                    "username": settings.AI_SERVICE_USERNAME,
                    "password": settings.AI_SERVICE_PASSWORD,
                },
            )
            resp.raise_for_status()
            token = resp.json()["token"]

        expires_at = _jwt_exp(token)
        if expires_at <= now:
            raise RuntimeError("NestJS 返回的服务账号 JWT 缺少有效 exp")
        _cached_token.update(token=token, expires_at=expires_at)
        return token


def set_request_customer_token(token: Optional[str]) -> Token:
    """为当前异步请求保存顾客 JWT。"""
    return _request_customer_token.set(token)


def reset_request_customer_token(context_token: Token) -> None:
    _request_customer_token.reset(context_token)


async def get_request_go_token() -> str:
    """用户代理调用使用顾客 JWT；系统读取调用回退到服务账号 JWT。"""
    return _request_customer_token.get() or await get_go_token()


class GoJWTAuth(httpx.Auth):
    """附加 JWT；服务账号收到 401 时刷新并只重试一次。"""

    requires_request_body = True

    async def async_auth_flow(self, request: httpx.Request):
        uses_customer_token = has_request_customer_token()
        request.headers["Authorization"] = f"Bearer {await get_request_go_token()}"
        response = yield request

        if response.status_code == 401 and not uses_customer_token:
            await response.aread()
            request.headers["Authorization"] = f"Bearer {await get_go_token(force=True)}"
            yield request
