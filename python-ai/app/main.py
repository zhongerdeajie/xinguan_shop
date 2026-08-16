"""星选 AI 购物管家 - 主入口"""
import os
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.api.routes import router
from app.core.limiter import limiter
from app.core.qdrant_vector import QdrantVectorStore
from app.core.redis_cache import RedisCache


DATA_DIR = "/app/app/data"
os.makedirs(DATA_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动
    app.state.vector_store = QdrantVectorStore(
        api_key=settings.MINIMAX_API_KEY or settings.ZHIPU_API_KEY,
        cache_file=os.path.join(DATA_DIR, "vectors.npz")
    )
    app.state.redis_cache = RedisCache(settings.REDIS_URL)
    
    # 如果向量为空，自动索引真实数据
    if app.state.vector_store.count() == 0:
        print("[Startup] 向量库为空，开始索引...")
        from app.data.real_loader import build_rag_documents
        docs = build_rag_documents()
        if not docs:
            from app.data.crawler import build_rag_documents as build_mock
            docs = build_mock()
        app.state.vector_store.add(docs)
        print(f"[Startup] 索引完成，共 {app.state.vector_store.count()} 篇")
    
    yield
    # 关闭
    pass


app = FastAPI(
    title="星选 AI 购物管家",
    description="多 Agent 智能电商助手",
    version="3.0.0",
    lifespan=lifespan,
)

# P2-2：注册限流器和 429 异常处理器
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "python-ai", "version": "3.0"}
