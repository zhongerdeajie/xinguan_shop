"""API 路由 - 星选 AI 购物管家"""
import re
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from app.core.langchain_rag import LangChainRAG
from app.core.simple_vector import SimpleVectorStore
from app.core.go_auth import reset_request_customer_token, set_request_customer_token
from app.agents.orchestrator import get_orchestrator, AGENT_REGISTRY


router = APIRouter()


def mask_pii(text: str) -> str:
    """个人信息脱敏：手机号、身份证号打码"""
    text = re.sub(r"1[3-9]\d{9}", lambda m: m.group(0)[:3] + "****" + m.group(0)[-4:], text)
    text = re.sub(r"\d{17}[\dXx]", lambda m: m.group(0)[:4] + "***********" + m.group(0)[-4:], text)
    return text


def build_order_suggestion(message: str, intent: str):
    """从用户消息中识别明确点到的菜品，生成可确认的订单建议"""
    if intent not in ("nl_order", "smart_bargain", "recommend", "price_compare"):
        return None

    import pymysql
    from app.config import settings

    try:
        conn = pymysql.connect(
            host=settings.MYSQL_HOST,
            port=settings.MYSQL_PORT,
            user=settings.MYSQL_USER,
            password=settings.MYSQL_PASSWORD,
            database=settings.MYSQL_DATABASE,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, name, price FROM dish WHERE status = 1")
                dishes = cur.fetchall()
        finally:
            conn.close()
    except Exception as e:
        import traceback
        traceback.print_exc()
        return None

    items = []
    for d in dishes:
        if d["name"] in message:
            m = re.search(rf'{re.escape(d["name"])}\s*[xX×*]\s*(\d+)', message)
            number = int(m.group(1)) if m else 1
            items.append({
                "dishId": d["id"],
                "name": d["name"],
                "price": float(d["price"]),
                "number": number,
            })
    if not items:
        return None
    total = round(sum(i["price"] * i["number"] for i in items), 2)
    return {"items": items, "total": total}


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    session_id: Optional[str] = Field(None, max_length=128)
    user_id: Optional[str] = Field(None, max_length=64)
    role: str = Field(default="user", pattern="^(user|merchant)$")


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    entity_type: Optional[str] = None


class IndexRequest(BaseModel):
    doc_id: int
    entity_type: str
    entity_id: int
    content: str


def get_rag():
    from app.main import app
    return LangChainRAG(app.state.vector_store, app.state.redis_cache)


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "python-ai",
        "version": "3.0",
        "agents": list(AGENT_REGISTRY.keys())
    }


@router.post("/chat")
async def chat(request: ChatRequest, raw_request: Request, rag: LangChainRAG = Depends(get_rag)):
    """AI 对话 - 通过 Orchestrator 路由到 6 个专项 Agent

    自动识别用户意图（自然语言下单 / 凑单 / 比价 / 售后 / 营销 / 推荐）
    """
    auth = raw_request.headers.get("authorization", "")
    customer_token = auth[7:] if auth.startswith("Bearer ") else None
    context_token = set_request_customer_token(customer_token)
    try:
        orchestrator = get_orchestrator()
        result = await orchestrator.route(
            message=request.message,
            user_id=request.user_id or "anonymous",
            role=request.role,
            session_id=request.session_id
        )
    finally:
        reset_request_customer_token(context_token)
    # 个人隐私脱敏 + 生成可确认的订单建议
    result["response"] = mask_pii(result.get("response", ""))
    result["order_suggestion"] = build_order_suggestion(request.message, result.get("intent"))
    print(f"[chat] intent={result.get('intent')} message_repr={request.message!r} has_dish={'辣椒炒肉' in request.message} suggestion={result.get('order_suggestion')}")
    return {
        "response": result["response"],
        "intent": result["intent"],
        "agent": result["agent"],
        "entities": result["entities"],
        "tools_used": result["tools_used"],
        "order_suggestion": result["order_suggestion"],
        "error": result["error"],
        "intent_confidence": result.get("intent_confidence", 0.0),
        "intent_method": result.get("intent_method", "keyword"),
    }


@router.post("/chat/legacy")
async def chat_legacy(request: ChatRequest, rag: LangChainRAG = Depends(get_rag)):
    """旧版 RAG 问答（兼容）"""
    answer = await rag.query(request.message)
    return {"response": answer, "agent": "legacy"}


@router.post("/search")
async def search(request: SearchRequest, rag: LangChainRAG = Depends(get_rag)):
    """语义检索"""
    results = await rag.search(request.query, request.top_k, request.entity_type)
    return {"results": results}


@router.post("/query")
async def rag_query(request: ChatRequest, rag: LangChainRAG = Depends(get_rag)):
    """RAG 问答"""
    answer = await rag.query(request.message)
    return {"answer": answer}


@router.post("/index")
async def index_document(request: IndexRequest):
    """索引文档"""
    from app.main import app
    vs: SimpleVectorStore = app.state.vector_store
    from app.core.embedding import get_embedding
    emb = get_embedding()
    vector = emb.embed_sync(request.content, etype="db")
    await vs.upsert([{
        "doc_id": request.doc_id,
        "entity_type": request.entity_type,
        "entity_id": request.entity_id,
        "content": request.content,
        "embedding": vector
    }])
    return {"status": "ok"}


@router.delete("/cache")
async def clear_cache():
    """清除 RAG 缓存"""
    from app.main import app
    redis_cache = app.state.redis_cache
    if redis_cache:
        await redis_cache.delete_pattern("rag:*")
    return {"status": "ok", "message": "缓存已清除"}


@router.get("/agents")
async def list_agents():
    """列出所有 Agent（用于调试和管理后台）"""
    orchestrator = get_orchestrator()
    return {
        "agents": orchestrator.list_agents()
    }


@router.post("/intent")
async def classify_intent_endpoint(request: ChatRequest):
    """仅识别意图（不执行 Agent）——使用工业级多层漏斗"""
    from app.agents.orchestrator import extract_entities
    from app.core.intent_classifier import get_intent_classifier
    result = await get_intent_classifier().classify(request.message, request.role)
    intent = result["intent"]
    entities = extract_entities(request.message)
    return {
        "intent": intent,
        "agent_name": AGENT_REGISTRY.get(intent, {}).get("name", "未匹配 / 超出范围"),
        "entities": entities,
        "confidence": result["confidence"],
        "method": result["method"],
        "reason": result.get("reason", ""),
    }
