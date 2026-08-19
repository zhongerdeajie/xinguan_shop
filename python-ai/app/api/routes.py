"""API 路由 - 星选 AI 购物管家"""
import json
import logging
import re
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from app.core.langchain_rag import LangChainRAG
from app.core.simple_vector import SimpleVectorStore
from app.core.go_auth import reset_request_customer_token, set_request_customer_token
from app.agents.orchestrator import get_orchestrator, AGENT_REGISTRY
from app.core.limiter import limiter


router = APIRouter()
logger = logging.getLogger(__name__)


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


async def _process_chat(request: Request, body: ChatRequest, rag: LangChainRAG) -> Dict[str, Any]:
    """chat 与 chat/stream 共享的内部处理：拿到 orchestrator 完整结果。"""
    auth = request.headers.get("authorization", "")
    customer_token = auth[7:] if auth.startswith("Bearer ") else None
    context_token = set_request_customer_token(customer_token)

    # P2-1：语义缓存查询（相似度 > 0.98 直接返回缓存答案）
    from app.core.semantic_cache import semantic_get, semantic_set
    _skip_cache_words = ["退款", "取消", "退货", "投诉", "确认", "下单", "少送", "漏发", "售后"]
    _should_skip_cache = any(w in body.message for w in _skip_cache_words)
    cached_response = await semantic_get(body.message) if not _should_skip_cache else None
    if cached_response is not None:
        reset_request_customer_token(context_token)
        try:
            from app.agents.base import get_redis
            _key = f"chat:history:{body.session_id}"
            _r = get_redis()
            _r.lpush(_key, json.dumps({"role": "assistant", "content": cached_response}, ensure_ascii=False))
            _r.lpush(_key, json.dumps({"role": "user", "content": body.message}, ensure_ascii=False))
            _r.ltrim(_key, 0, 39)
            _r.expire(_key, 86400)
        except Exception:
            pass
        return {
            "response": cached_response,
            "intent": "cached",
            "agent": "semantic_cache",
            "entities": {},
            "tools_used": [],
            "order_suggestion": None,
            "error": False,
            "intent_confidence": 1.0,
            "intent_method": "semantic_cache",
        }

    try:
        orchestrator = get_orchestrator()
        result = await orchestrator.route(
            message=body.message,
            user_id=body.user_id or "anonymous",
            role=body.role,
            session_id=body.session_id
        )
    finally:
        reset_request_customer_token(context_token)

    if not result.get("error") and result.get("intent") not in ("aftersales", "out_of_scope"):
        await semantic_set(body.message, result.get("response", ""))
    result["response"] = mask_pii(result.get("response", ""))
    result["order_suggestion"] = build_order_suggestion(body.message, result.get("intent"))
    print(f"[chat] intent={result.get('intent')} message_repr={body.message!r} has_dish={'辣椒炒肉' in body.message} suggestion={result.get('order_suggestion')}")
    return result


@router.post("/chat")
@limiter.limit("10/minute")
async def chat(request: Request, body: ChatRequest, rag: LangChainRAG = Depends(get_rag)):
    """AI 对话 - 通过 Orchestrator 路由到 6 个专项 Agent（一次性返回）"""
    result = await _process_chat(request, body, rag)
    return {
        "response": result["response"],
        "intent": result["intent"],
        "agent": result["agent"],
        "entities": result["entities"],
        "tools_used": result["tools_used"],
        "order_suggestion": result.get("order_suggestion"),
        "error": result["error"],
        "intent_confidence": result.get("intent_confidence", 0.0),
        "intent_method": result.get("intent_method", "keyword"),
    }


@router.post("/chat/stream")
@limiter.limit("10/minute")
async def chat_stream(request: Request, body: ChatRequest, rag: LangChainRAG = Depends(get_rag)):
    """AI 对话 - Server-Sent Events 流式响应（LLM 真流）

    事件格式（每行一条 data: {...}）：
      1) data: {"type":"meta","intent":"...","agent":"...","entities":{...}}
      2) data: {"type":"chunk","delta":"你"}
      3) data: {"type":"chunk","delta":"好"}
      ...（逐 token 推送,LLM 生成一个 token 就 yield 一次,真正流式）
      N) data: {"type":"done","full":"完整文本","intent_confidence":...}

    实现策略：
      - 优先走 rag.query_stream()：LangChain chain.astream() 拿到 LLM 真 token 流
      - 如果 rag 不可用,降级到字符切片（原有方案,保证不挂）
    """
    auth = request.headers.get("authorization", "")
    customer_token = auth[7:] if auth.startswith("Bearer ") else None
    context_token = set_request_customer_token(customer_token)

    # 先做意图识别（取 intent + agent + entities,response 字段忽略）
    from app.agents.orchestrator import get_orchestrator
    try:
        orchestrator = get_orchestrator()
        # 注意：这里调一次完整 route()，目的是拿到意图/实体；
        # 返回的 response 字段会被丢弃，下面用 LLM 真流重新生成。
        # 改造点（TODO）：把 intent_recognize 从 route() 拆出来，避免重复 LLM 调用
        intent_result = await orchestrator.route(
            message=body.message,
            user_id=body.user_id or "anonymous",
            role=body.role,
            session_id=body.session_id,
        )
        intent = intent_result.get("intent", "chitchat")
        agent_name = intent_result.get("agent", "chitchat")
        entities = intent_result.get("entities", {})
        intent_confidence = intent_result.get("intent_confidence", 0.0)
        intent_method = intent_result.get("intent_method", "keyword")
    except Exception as e:
        logger.error(f"intent 识别失败: {e}", exc_info=True)
        intent = "chitchat"
        agent_name = "chitchat"
        entities = {}
        intent_confidence = 0.0
        intent_method = "keyword"

    meta_payload = {
        "type": "meta",
        "intent": intent,
        "agent": agent_name,
        "entities": entities,
        "tools_used": [],
        "order_suggestion": None,
    }

    async def event_stream():
        nonlocal entities
        # 1) 先发 meta
        yield f"data: {json.dumps(meta_payload, ensure_ascii=False)}\n\n"

        accumulated = ""
        try:
            # 2) 走 LLM 真流（LangChain chain.astream）
            async for delta in rag.query_stream(body.message):
                if not delta:
                    continue
                accumulated += delta
                yield f"data: {json.dumps({'type':'chunk','delta':delta}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error(f"真流失败,降级到字符切片: {e}", exc_info=True)
            # 降级：一次性 invoke 再切片
            try:
                full = await rag.query(body.message)
                if not full:
                    full = "抱歉,我现在有点忙,请稍后再试。"
                accumulated = full
                import asyncio as _aio
                for ch in full:
                    yield f"data: {json.dumps({'type':'chunk','delta':ch}, ensure_ascii=False)}\n\n"
                    await _aio.sleep(0.033)
            except Exception as e2:
                logger.error(f"降级也失败: {e2}")
                accumulated = "抱歉,服务暂时不可用。"
                yield f"data: {json.dumps({'type':'chunk','delta':accumulated}, ensure_ascii=False)}\n\n"

        # 3) 最后发 done
        done_payload = {
            "type": "done",
            "full": accumulated,
            "intent_confidence": intent_confidence,
            "intent_method": intent_method,
        }
        yield f"data: {json.dumps(done_payload, ensure_ascii=False)}\n\n"

    reset_request_customer_token(context_token)
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # nginx 不要 buffer
            "Connection": "keep-alive",
        },
    )


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
    vs = app.state.vector_store
    from app.core.embedding import get_embedding
    emb = get_embedding()
    vector = emb.embed_sync(request.content, etype="db")
    vs.add([{
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
