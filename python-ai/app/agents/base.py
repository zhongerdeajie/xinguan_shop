"""Agent 基类 - 所有专项 Agent 的父类

提供：
- 工具调用白名单 + 金额上限
- LLM 调用封装
- Token 计数 + 成本估算
- 错误重试 + 断点续传
"""
from typing import Dict, Any, List, Optional, Callable
import os
import json
import time
import asyncio
from abc import ABC, abstractmethod

import redis


# ==================== Redis 多轮对话记忆（P0-1）====================

_redis_client = None


def get_redis():
    """获取 Redis 连接（单例，用于多轮对话记忆）"""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            os.getenv("REDIS_URL", "redis://redis:6379/0"),
            decode_responses=True,
        )
    return _redis_client


# ==================== 工具白名单配置 ====================

DEFAULT_TOOL_POLICY = {
    # 查询类（无金额风险）
    "search_products": {"enabled": True, "require_confirm": False},
    "get_product_detail": {"enabled": True, "require_confirm": False},
    "search_categories": {"enabled": True, "require_confirm": False},
    "get_user_address": {"enabled": True, "require_confirm": False},
    "get_user_history": {"enabled": True, "require_confirm": False},
    "get_price_history": {"enabled": True, "require_confirm": False},

    # 写操作类（有金额风险）
    "add_to_cart": {"enabled": True, "require_confirm": False, "max_amount": 5000},
    "remove_from_cart": {"enabled": True, "require_confirm": False},
    "create_order": {"enabled": True, "require_confirm": True, "max_amount": 5000},
    "apply_coupon": {"enabled": True, "require_confirm": False, "max_discount": 100},

    # 高风险类（必须二次确认）
    "refund": {"enabled": True, "require_confirm": True, "max_amount": 500},
    "cancel_order": {"enabled": True, "require_confirm": True},
    "modify_address": {"enabled": True, "require_confirm": True},

    # 禁用类（无论如何不允许）
    "delete_account": {"enabled": False},
    "modify_price": {"enabled": False},
    "bypass_security": {"enabled": False},
}


class ToolPermissionDenied(Exception):
    """工具调用权限被拒绝"""
    pass


class BaseAgent(ABC):
    """所有 Agent 的基类"""

    def __init__(self, name: str, max_token: int = 4000):
        self.name = name
        self.max_token = max_token
        self.tool_policy = dict(DEFAULT_TOOL_POLICY)
        self.token_used = 0
        self.tools_used: List[str] = []
        self.call_count = 0

        # LLM 配置
        self.llm_model = os.getenv("LLM_MODEL", "glm-4-flash")
        self.llm_api_key = os.getenv("LLM_API_KEY") or os.getenv("ZHIPU_API_KEY", "")
        self.llm_base_url = os.getenv("LLM_API_URL", "https://open.bigmodel.cn/api/paas/v4/")

    @abstractmethod
    def get_system_prompt(self) -> str:
        """获取系统 Prompt（子类必须实现）"""
        pass

    @abstractmethod
    def get_tools(self) -> List[Dict[str, Any]]:
        """获取可用工具列表（子类必须实现）"""
        pass

    async def run(self, message: str, user_id: str = "anonymous",
                  session_id: str = "default",
                  entities: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """执行 Agent 主流程（P0-1 改造：加载历史 → 执行 → 保存历史）

        子类可重写此方法实现自定义推理流程。
        """
        entities = entities or {}
        self.tools_used = []

        # P0-1：从 Redis 加载多轮对话历史
        history = self._load_history(session_id)

        try:
            # 调用子类的具体实现（传入 history）
            result = await self._execute(message, user_id, session_id, entities, history=history)
            # P0-1：保存本轮对话到 Redis
            self._save_history(session_id, message, result)
            return {
                "response": result,
                "tools_used": self.tools_used,
                "token_used": self.token_used,
                "error": False
            }
        except Exception as e:
            return {
                "response": f"处理出错：{str(e)}",
                "tools_used": self.tools_used,
                "token_used": self.token_used,
                "error": True
            }

    @abstractmethod
    async def _execute(self, message: str, user_id: str,
                       session_id: str, entities: Dict[str, Any],
                       history: Optional[List[Dict[str, str]]] = None) -> str:
        """子类的具体执行逻辑（P0-1：新增 history 参数）"""
        pass

    # ---------- P0-1：多轮对话记忆 ----------
    def _load_history(self, session_id: str, max_turns: int = 10) -> List[Dict[str, str]]:
        """从 Redis 加载最近 N 轮对话历史

        返回格式: [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}, ...]
        按时间正序排列（最早的在前），失败时返回空列表。
        """
        try:
            key = f"chat:history:{session_id}"
            raw = get_redis().lrange(key, 0, max_turns * 2 - 1)
            # LPUSH 是最新在前，反转为时间正序
            items = [json.loads(r) for r in reversed(raw)]
            return items
        except Exception:
            return []

    def _save_history(self, session_id: str, user_msg: str, assistant_msg: str,
                      max_turns: int = 20, ttl: int = 86400) -> None:
        """保存本轮对话到 Redis List（LPUSH 最新在前，LTRIM 保留 20 轮，24h 过期）"""
        try:
            key = f"chat:history:{session_id}"
            r = get_redis()
            r.lpush(key, json.dumps({"role": "assistant", "content": assistant_msg}, ensure_ascii=False))
            r.lpush(key, json.dumps({"role": "user", "content": user_msg}, ensure_ascii=False))
            r.ltrim(key, 0, max_turns * 2 - 1)
            r.expire(key, ttl)
        except Exception:
            pass  # 记忆失败不阻断主流程

    def check_tool_permission(self, tool_name: str, amount: float = 0) -> None:
        """检查工具调用权限

        Raises:
            ToolPermissionDenied: 工具被禁用或金额超限
        """
        policy = self.tool_policy.get(tool_name, {"enabled": False})

        if not policy.get("enabled", False):
            raise ToolPermissionDenied(f"工具 {tool_name} 已被禁用")

        max_amount = policy.get("max_amount", float("inf"))
        if amount > max_amount:
            raise ToolPermissionDenied(
                f"工具 {tool_name} 金额 {amount} 超过上限 {max_amount}"
            )

    def call_llm(self, messages: List[Dict[str, str]],
                 temperature: float = 0.3) -> str:
        """调用 LLM（同步版本）"""
        try:
            import requests

            self.call_count += 1
            url = f"{self.llm_base_url.rstrip('/')}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.llm_api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": self.llm_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": self.max_token
            }

            resp = requests.post(url, headers=headers, json=payload, timeout=30)
            if resp.status_code != 200:
                raise Exception(f"LLM API error: {resp.status_code} {resp.text[:200]}")

            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            # 估算 token（粗略：1 token ≈ 1.5 字符）
            self.token_used += len(content) // 1.5
            return content
        except Exception as e:
            # 降级：返回固定回复
            return f"[LLM 调用失败，使用规则引擎] {messages[-1].get('content', '')[:100]}"

    async def call_llm_async(self, messages: List[Dict[str, str]],
                             temperature: float = 0.3) -> str:
        """异步调用 LLM"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.call_llm, messages, temperature
        )

    def record_tool_usage(self, tool_name: str) -> None:
        """记录工具使用"""
        if tool_name not in self.tools_used:
            self.tools_used.append(tool_name)


# ==================== HTTP 工具调用辅助 ====================

async def call_go_service(path: str, method: str = "GET",
                          data: Optional[Dict] = None,
                          user_id: str = "anonymous") -> Dict[str, Any]:
    """调用 Go 服务 API；用户身份只来自 Bearer JWT。"""
    import aiohttp
    from app.core.go_auth import (
        get_go_token,
        get_request_go_token,
        has_request_customer_token,
    )

    go_url = os.getenv("GO_SERVICE_URL", "http://go-service:8081")
    url = f"{go_url}{path}"

    async def send(session, token: str):
        headers = {"Authorization": f"Bearer {token}"}
        if method == "GET":
            return await session.get(url, headers=headers, timeout=10)
        return await session.post(url, headers=headers, json=data, timeout=10)

    try:
        uses_customer_token = has_request_customer_token()
        async with aiohttp.ClientSession() as session:
            resp = await send(session, await get_request_go_token())
            if resp.status == 401 and not uses_customer_token:
                resp.release()
                resp = await send(session, await get_go_token(force=True))
            async with resp:
                return {"status": resp.status, "data": await resp.json()}
    except Exception as e:
        return {"status": 500, "error": str(e), "data": {}}


async def call_nestjs_api(path: str, method: str = "GET",
                          data: Optional[Dict] = None,
                          user_id: str = "anonymous") -> Dict[str, Any]:
    """调用 NestJS API（P0-2 修复：自动携带顾客 JWT token）"""
    import aiohttp
    nest_url = os.getenv("NESTJS_URL", "http://nestjs-api:3000")
    url = f"{nest_url}{path}"

    # P0-2 修复：从 go_auth 获取顾客 token，携带到 NestJS 请求
    headers = {"Content-Type": "application/json"}
    try:
        from app.core.go_auth import has_request_customer_token, get_request_go_token
        if has_request_customer_token():
            token = await get_request_go_token()
            headers["Authorization"] = f"Bearer {token}"
    except Exception:
        pass  # 获取 token 失败不阻断请求

    try:
        async with aiohttp.ClientSession() as session:
            if method == "GET":
                async with session.get(url, headers=headers, timeout=10) as resp:
                    return {"status": resp.status, "data": await resp.json()}
            elif method == "PUT":
                async with session.put(url, json=data, headers=headers, timeout=10) as resp:
                    return {"status": resp.status, "data": await resp.json()}
            elif method == "DELETE":
                async with session.delete(url, json=data, headers=headers, timeout=10) as resp:
                    return {"status": resp.status, "data": await resp.json()}
            else:
                async with session.post(url, json=data, headers=headers, timeout=10) as resp:
                    return {"status": resp.status, "data": await resp.json()}
    except Exception as e:
        return {"status": 500, "error": str(e), "data": {}}
