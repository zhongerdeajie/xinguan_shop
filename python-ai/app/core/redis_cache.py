"""Redis 缓存封装 - 增强版"""
import redis.asyncio as aioredis
import json
import hashlib
from typing import Optional, Any, Union
from functools import wraps
import logging

logger = logging.getLogger(__name__)


class RedisCache:
    """异步 Redis 缓存"""

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.client = None

    async def connect(self):
        if not self.client:
            self.client = aioredis.from_url(self.redis_url, decode_responses=True)
            logger.info(f"Redis connected: {self.redis_url}")

    async def get(self, key: str) -> Optional[str]:
        if not self.client:
            await self.connect()
        return await self.client.get(key)

    async def get_json(self, key: str) -> Optional[Any]:
        """获取 JSON 对象"""
        data = await self.get(key)
        if data:
            try:
                return json.loads(data)
            except json.JSONDecodeError:
                return None
        return None

    async def set(self, key: str, value: str, ttl: int = 3600):
        if not self.client:
            await self.connect()
        await self.client.set(key, value, ex=ttl)

    async def set_json(self, key: str, value: Any, ttl: int = 3600):
        """存储 JSON 对象"""
        await self.set(key, json.dumps(value, ensure_ascii=False), ttl)

    async def delete(self, key: str):
        if not self.client:
            await self.connect()
        await self.client.delete(key)

    async def delete_pattern(self, pattern: str):
        """按模式删除"""
        if not self.client:
            await self.connect()
        keys = []
        async for key in self.client.scan_iter(match=pattern):
            keys.append(key)
        if keys:
            await self.client.delete(*keys)

    async def increment(self, key: str, amount: int = 1) -> int:
        """原子递增"""
        if not self.client:
            await self.connect()
        return await self.client.incrby(key, amount)

    async def decrement(self, key: str, amount: int = 1) -> int:
        """原子递减"""
        if not self.client:
            await self.connect()
        return await self.client.decrby(key, amount)

    async def expire(self, key: str, ttl: int):
        """设置过期时间"""
        if not self.client:
            await self.connect()
        await self.client.expire(key, ttl)

    async def close(self):
        if self.client:
            await self.client.close()


def cache_response(ttl: int = 300, key_prefix: str = ""):
    """缓存装饰器 - 用于 API 响应缓存"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 生成缓存键
            cache_key = _generate_cache_key(key_prefix, args, kwargs)
            
            # 尝试从缓存获取
            from app.main import app
            redis_cache: RedisCache = getattr(app.state, 'redis_cache', None)
            
            if redis_cache:
                cached = await redis_cache.get_json(cache_key)
                if cached is not None:
                    logger.debug(f"Cache HIT: {cache_key}")
                    return cached
            
            # 执行原函数
            result = await func(*args, **kwargs)
            
            # 存入缓存
            if redis_cache and result:
                await redis_cache.set_json(cache_key, result, ttl)
                logger.debug(f"Cache SET: {cache_key}")
            
            return result
        return wrapper
    return decorator


def _generate_cache_key(prefix: str, args: tuple, kwargs: dict) -> str:
    """生成缓存键"""
    key_parts = [prefix] if prefix else []
    key_parts.extend([str(a) for a in args if isinstance(a, (str, int, float))])
    key_parts.extend([f"{k}={v}" for k, v in sorted(kwargs.items()) if isinstance(v, (str, int, float))])
    raw_key = ":".join(key_parts)
    # 对长键进行哈希
    if len(raw_key) > 200:
        raw_key = hashlib.md5(raw_key.encode()).hexdigest()
    return f"rag:{raw_key}"
