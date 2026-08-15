"""智谱 Embedding-3 向量编码"""
import httpx
import asyncio
import time
from typing import List, Dict, Tuple, Optional
from collections import OrderedDict
from app.config import settings
import threading


class ZhipuEmbedding:
    """智谱 AI Embedding-3 客户端 - 带 LRU 缓存"""

    def __init__(self, cache_size: int = 500, ttl: int = 3600):
        self.api_url = "https://open.bigmodel.cn/api/paas/v4/embeddings"
        self.api_key = settings.ZHIPU_API_KEY
        self.model = settings.ZHIPU_EMBEDDING_MODEL
        self.dim = settings.EMBEDDING_DIM
        self._cache: Dict[str, Tuple[List[float], float]] = OrderedDict()
        self._max_size = cache_size
        self._ttl = ttl
        self._lock = threading.Lock()

    def _get_cached(self, text: str) -> Optional[List[float]]:
        """获取缓存，自动淘汰过期项"""
        with self._lock:
            if text not in self._cache:
                return None
            vec, ts = self._cache[text]
            if time.time() - ts > self._ttl:
                del self._cache[text]
                return None
            # 移到末尾（LRU）
            self._cache.move_to_end(text)
            return vec

    def _set_cached(self, text: str, vec: List[float]):
        """设置缓存，超过容量时淘汰最旧的"""
        with self._lock:
            if text in self._cache:
                del self._cache[text]
            # 淘汰最旧的（如果超过容量）
            while len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)
            self._cache[text] = (vec, time.time())

    async def embed(self, text: str) -> List[float]:
        """单文本嵌入"""
        cached = self._get_cached(text)
        if cached is not None:
            return cached
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self.api_url,
                json={"model": self.model, "input": text},
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
            )
            data = resp.json()
            vec = data["data"][0]["embedding"]
            self._set_cached(text, vec)
            return vec

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """批量嵌入"""
        results: List[Optional[List[float]]] = [None] * len(texts)
        to_fetch = []
        to_fetch_idx = []

        for i, text in enumerate(texts):
            cached = self._get_cached(text)
            if cached is not None:
                results[i] = cached
            else:
                to_fetch.append(text)
                to_fetch_idx.append(i)

        if to_fetch:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    self.api_url,
                    json={"model": self.model, "input": to_fetch},
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
                )
                data = resp.json()
                for idx, item in zip(to_fetch_idx, sorted(data["data"], key=lambda x: x["index"])):
                    vec = item["embedding"]
                    self._set_cached(to_fetch[idx], vec)
                    results[idx] = vec

        return results

    def embed_sync(self, text: str) -> List[float]:
        """同步嵌入"""
        cached = self._get_cached(text)
        if cached is not None:
            return cached
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                self.api_url,
                json={"model": self.model, "input": text},
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
            )
            data = resp.json()
            vec = data["data"][0]["embedding"]
            self._set_cached(text, vec)
            return vec


class MiniMaxEmbedding:
    """MiniMax embo-01 向量编码（1536 维）

    端点：POST {MINIMAX_EMBEDDING_URL}
    请求：{"model": "embo-01", "type": "query"|"db", "texts": [...]}
    响应：{"vectors": [[...], ...], "base_resp": {...}}
    """

    def __init__(self, cache_size: int = 500, ttl: int = 3600):
        self.api_url = settings.MINIMAX_EMBEDDING_URL
        self.api_key = settings.MINIMAX_API_KEY
        self.model = settings.MINIMAX_EMBEDDING_MODEL
        self.dim = settings.EMBEDDING_DIM
        self._cache: Dict[str, Tuple[List[float], float]] = OrderedDict()
        self._max_size = cache_size
        self._ttl = ttl
        self._lock = threading.Lock()

    def _get_cached(self, text: str) -> Optional[List[float]]:
        with self._lock:
            if text not in self._cache:
                return None
            vec, ts = self._cache[text]
            if time.time() - ts > self._ttl:
                del self._cache[text]
                return None
            self._cache.move_to_end(text)
            return vec

    def _set_cached(self, text: str, vec: List[float]):
        with self._lock:
            if text in self._cache:
                del self._cache[text]
            while len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)
            self._cache[text] = (vec, time.time())

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    def _payload(self, texts: List[str], etype: str) -> Dict:
        return {"model": self.model, "type": etype, "texts": texts}

    def _parse(self, resp_json: Dict, texts: List[str]) -> List[List[float]]:
        vectors = resp_json.get("vectors")
        if not vectors:
            base = resp_json.get("base_resp", {})
            raise RuntimeError(f"MiniMax embedding 失败: {base.get('status_code')} {base.get('status_msg')}")
        return vectors

    async def embed(self, text: str, etype: str = "query") -> List[float]:
        cached = self._get_cached(text)
        if cached is not None:
            return cached
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(self.api_url, json=self._payload([text], etype), headers=self._headers())
            data = resp.json()
            vec = self._parse(data, [text])[0]
            self._set_cached(text, vec)
            return vec

    async def embed_batch(self, texts: List[str], etype: str = "db") -> List[List[float]]:
        results: List[Optional[List[float]]] = [None] * len(texts)
        to_fetch = []
        to_fetch_idx = []
        for i, text in enumerate(texts):
            cached = self._get_cached(text)
            if cached is not None:
                results[i] = cached
            else:
                to_fetch.append(text)
                to_fetch_idx.append(i)
        if to_fetch:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(self.api_url, json=self._payload(to_fetch, etype), headers=self._headers())
                data = resp.json()
                vectors = self._parse(data, to_fetch)
                for idx, vec in zip(to_fetch_idx, vectors):
                    self._set_cached(to_fetch[idx], vec)
                    results[idx] = vec
        return results

    def embed_sync(self, text: str, etype: str = "query") -> List[float]:
        cached = self._get_cached(text)
        if cached is not None:
            return cached
        with httpx.Client(timeout=30) as client:
            resp = client.post(self.api_url, json=self._payload([text], etype), headers=self._headers())
            data = resp.json()
            vec = self._parse(data, [text])[0]
            self._set_cached(text, vec)
            return vec


def get_embedding():
    """按配置返回向量客户端（默认 MiniMax embo-01）"""
    provider = (settings.EMBEDDING_PROVIDER or "minimax").strip().lower()
    if provider == "zhipu":
        return ZhipuEmbedding()
    return MiniMaxEmbedding()
