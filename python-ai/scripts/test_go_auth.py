import asyncio
import base64
import json
import time
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app.core import go_auth


def make_token(expires_at: float) -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps({"exp": expires_at}).encode("utf-8")
    ).decode("ascii").rstrip("=")
    return f"header.{payload}.signature"


class FakeResponse:
    def __init__(self, token: str):
        self._token = token

    def raise_for_status(self):
        return None

    def json(self):
        return {"token": self._token}


class FakeAsyncClient:
    def __init__(self, token: str, counter: dict):
        self._token = token
        self._counter = counter

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, *args, **kwargs):
        self._counter["logins"] += 1
        await asyncio.sleep(0)
        return FakeResponse(self._token)


class GoAuthTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        go_auth._cached_token.update(token=None, expires_at=0.0)
        self.context_token = go_auth.set_request_customer_token(None)

    def tearDown(self):
        go_auth.reset_request_customer_token(self.context_token)

    async def test_valid_cached_service_token_is_reused(self):
        token = make_token(time.time() + 3600)
        go_auth._cached_token.update(token=token, expires_at=time.time() + 3600)
        with patch.object(go_auth.httpx, "AsyncClient") as client:
            result = await go_auth.get_go_token()
        self.assertEqual(result, token)
        client.assert_not_called()

    async def test_near_expiry_service_token_refreshes_once_for_concurrent_calls(self):
        refreshed = make_token(time.time() + 3600)
        go_auth._cached_token.update(
            token=make_token(time.time() + 10),
            expires_at=time.time() + 10,
        )
        counter = {"logins": 0}

        def client_factory(*args, **kwargs):
            return FakeAsyncClient(refreshed, counter)

        with patch.object(go_auth.httpx, "AsyncClient", side_effect=client_factory):
            results = await asyncio.gather(
                go_auth.get_go_token(),
                go_auth.get_go_token(),
                go_auth.get_go_token(),
            )

        self.assertEqual(results, [refreshed, refreshed, refreshed])
        self.assertEqual(counter["logins"], 1)

    async def test_service_token_401_refreshes_and_retries_once(self):
        calls = []

        async def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request.headers["Authorization"])
            status = 401 if len(calls) == 1 else 200
            return httpx.Response(status, json={"ok": status == 200})

        with patch.object(
            go_auth,
            "get_request_go_token",
            AsyncMock(return_value="expired-service-token"),
        ), patch.object(
            go_auth,
            "get_go_token",
            AsyncMock(return_value="refreshed-service-token"),
        ) as refresh:
            async with httpx.AsyncClient(
                transport=httpx.MockTransport(handler),
                auth=go_auth.GoJWTAuth(),
            ) as client:
                response = await client.get("http://go-service/api/v1/dishes")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            calls,
            ["Bearer expired-service-token", "Bearer refreshed-service-token"],
        )
        refresh.assert_awaited_once_with(force=True)

    async def test_customer_token_401_does_not_fall_back_to_service_account(self):
        context_token = go_auth.set_request_customer_token("customer-token")
        try:
            async def handler(request: httpx.Request) -> httpx.Response:
                return httpx.Response(401, json={"message": "expired"})

            with patch.object(
                go_auth,
                "get_go_token",
                AsyncMock(return_value="service-token"),
            ) as refresh:
                async with httpx.AsyncClient(
                    transport=httpx.MockTransport(handler),
                    auth=go_auth.GoJWTAuth(),
                ) as client:
                    response = await client.get("http://go-service/api/v1/cart")

            self.assertEqual(response.status_code, 401)
            refresh.assert_not_awaited()
        finally:
            go_auth.reset_request_customer_token(context_token)


if __name__ == "__main__":
    unittest.main()
