"""语义缓存（P2-1）- 学 GPTCache / Redis VL

核心思路：不比较 query 文本是否相同，而是比较 query 的 embedding 是否相似。
相似度 > 阈值 → 直接返回缓存的答案，实现『推荐菜』和『推荐个菜』命中同一缓存。

存储结构（Redis Hash）：
  key: sem_cache:{md5(query)}
  field: query / embedding(JSON) / response / created_at
索引：
  sem_cache:keys（Set，存所有缓存 key，便于遍历）

数据量小时遍历比较够用；量大后可换 Redis Vector Search 或 Qdrant。
"""
import json
import hashlib
import math
import time
from typing import Optional, List, Dict, Any

from app.agents.base import get_redis

CACHE_INDEX_KEY = "sem_cache:keys"
CACHE_PREFIX = "sem_cache:"
DEFAULT_TTL = 3600  # 1 小时
DEFAULT_THRESHOLD = 0.98  # 相似度阈值（调高避免短文本误命中）
MAX_CACHE_ENTRIES = 500  # 缓存上限，超出时清理最旧的


def _cosine(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return dot / (na * nb)


async def _embed(text: str) -> Optional[List[float]]:
    """对 query 做 embedding，失败返回 None（缓存降级为不命中）"""
    try:
        from app.core.embedding import get_embedding
        return await get_embedding().embed(text)
    except Exception:
        return None


async def semantic_get(query: str, threshold: float = DEFAULT_THRESHOLD) -> Optional[str]:
    """语义缓存查询：找到相似度超过阈值的缓存回答

    Returns:
        命中时返回缓存的 response，未命中返回 None。
    """
    try:
        q_vec = await _embed(query)
        if not q_vec:
            return None

        r = get_redis()
        keys = r.smembers(CACHE_INDEX_KEY)
        if not keys:
            return None

        best_score = 0.0
        best_response: Optional[str] = None
        for key in keys:
            data = r.hgetall(key)
            if not data:
                continue
            try:
                cached_vec = json.loads(data.get("embedding", "[]"))
            except (json.JSONDecodeError, TypeError):
                continue
            if not cached_vec:
                continue
            score = _cosine(q_vec, cached_vec)
            if score > best_score:
                best_score = score
                best_response = data.get("response")

        if best_score >= threshold and best_response is not None:
            return best_response
        return None
    except Exception:
        return None


async def semantic_set(query: str, response: str, ttl: int = DEFAULT_TTL) -> None:
    """写入语义缓存：存 {query, embedding, response}，设置 TTL"""
    try:
        q_vec = await _embed(query)
        if not q_vec:
            return

        r = get_redis()
        key = f"{CACHE_PREFIX}{hashlib.md5(query.encode('utf-8')).hexdigest()}"
        r.hset(key, mapping={
            "query": query,
            "embedding": json.dumps(q_vec),
            "response": response,
            "created_at": str(int(time.time())),
        })
        r.expire(key, ttl)
        r.sadd(CACHE_INDEX_KEY, key)

        # 缓存数量控制：超过上限时清理最旧的 10%
        size = r.scard(CACHE_INDEX_KEY)
        if size and size > MAX_CACHE_ENTRIES:
            all_keys = list(r.smembers(CACHE_INDEX_KEY))
            aged = []
            for k in all_keys:
                created = r.hget(k, "created_at")
                aged.append((int(created) if created else 0, k))
            aged.sort()
            for _, old_key in aged[: max(1, size // 10)]:
                r.delete(old_key)
                r.srem(CACHE_INDEX_KEY, old_key)
    except Exception:
        pass  # 缓存写入失败不阻断主流程
