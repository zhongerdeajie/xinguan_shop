"""LangChain RAG 检索链 - 使用 SimpleVectorStore + Redis 缓存"""
import os
for _k in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]:
    os.environ.pop(_k, None)

from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI
from app.config import settings
from app.core.simple_vector import SimpleVectorStore
from app.core.reranker import BGEReranker, get_reranker
import logging
import hashlib

logger = logging.getLogger(__name__)


class LangChainRAG:
    """基于 LangChain 的 RAG 检索增强生成"""

    def __init__(self, vector_store: SimpleVectorStore, redis_cache=None, reranker: BGEReranker = None, enable_rerank: bool = True):
        self.vector_store = vector_store
        self.redis_cache = redis_cache
        self.reranker = reranker if reranker is not None else get_reranker()
        self.enable_rerank = enable_rerank
        self.llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.ZHIPU_API_KEY,
            base_url=settings.LLM_API_URL,
            temperature=settings.LLM_TEMPERATURE,
        )
        self._setup_chain()

    def _setup_chain(self):
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", """你是「星选 AI 购物管家」，一个智能电商助手。
基于以下检索到的商品知识和用户评价回答问题。

【回答规则】
1. 仅基于提供的上下文回答，不要编造信息
2. 如果上下文中没有相关信息，请直接说"没有找到相关信息"
3. 回答要简洁、有用、自然
4. 涉及价格时，给出具体区间；涉及口味时，引用真实评价

上下文:
{context}"""),
            ("human", "{question}")
        ])
        self.chain = (
            {"context": self._retrieve, "question": RunnablePassthrough()}
            | self.prompt
            | self.llm
            | StrOutputParser()
        )

    def _get_cache_key(self, prefix: str, content: str) -> str:
        content_hash = hashlib.md5(content.encode()).hexdigest()
        return f"rag:{prefix}:{content_hash}"

    async def _retrieve(self, question: str) -> str:
        """检索 + BGE 重排序"""
        cache_key = self._get_cache_key("retrieve", question)
        
        if self.redis_cache:
            try:
                cached = await self.redis_cache.get(cache_key)
                if cached:
                    return cached
            except Exception as e:
                logger.warning(f"Redis cache read error: {e}")

        # 初步检索：召回更多候选，再由 BGE 精排
        recall_k = 20 if self.enable_rerank else 5
        # P1-1 适配 QdrantVectorStore：先 embedding 再搜索
        from app.core.embedding import get_embedding
        _emb = get_embedding()
        _query_vec = await _emb.embed(question)
        candidates = self.vector_store.search(_query_vec, top_k=recall_k)
        
        if not candidates:
            context = "没有找到相关信息"
        else:
            # BGE 重排序：交叉编码器精确打分
            if self.enable_rerank and self.reranker:
                try:
                    results = self.reranker.rerank(
                        query=question,
                        documents=candidates,
                        top_k=5,
                        content_key="content"
                    )
                except Exception as e:
                    logger.warning(f"BGE rerank failed: {e}, fallback to vector search")
                    results = candidates[:5]
            else:
                results = candidates[:5]

            context = "\n\n".join([
                f"[{r['entity_type']}] {r['content']} (rerank: {r.get('rerank_score', r['score']):.3f})"
                for r in results
            ])

        if self.redis_cache and context != "没有找到相关信息":
            try:
                await self.redis_cache.set(cache_key, context, ttl=1800)
            except Exception as e:
                logger.warning(f"Redis cache write error: {e}")

        return context

    async def query(self, question: str) -> str:
        """RAG 问答"""
        cache_key = self._get_cache_key("query", question)
        
        if self.redis_cache:
            try:
                cached = await self.redis_cache.get(cache_key)
                if cached:
                    return cached
            except Exception as e:
                logger.warning(f"Redis cache read error: {e}")

        context = await self._retrieve(question)
        response = self.llm.invoke(
            self.prompt.format_messages(context=context, question=question)
        )
        result = response.content

        if self.redis_cache:
            try:
                await self.redis_cache.set(cache_key, result, ttl=3600)
            except Exception as e:
                logger.warning(f"Redis cache write error: {e}")

        return result

    async def search(self, query: str, top_k: int = 5, entity_type: str = None) -> List[Dict]:
        """检索 + BGE 重排序"""
        # 召回更多候选用于重排序
        recall_k = 20 if self.enable_rerank else top_k
        # P1-1 适配 QdrantVectorStore：先 embedding 再搜索
        from app.core.embedding import get_embedding
        _emb = get_embedding()
        _query_vec = await _emb.embed(query)
        candidates = self.vector_store.search(_query_vec, top_k=recall_k, entity_type=entity_type)
        
        if not candidates:
            return []
        
        # BGE 精排
        if self.enable_rerank and self.reranker:
            try:
                results = self.reranker.rerank(
                    query=query,
                    documents=candidates,
                    top_k=top_k,
                    content_key="content"
                )
                return results
            except Exception as e:
                logger.warning(f"BGE rerank failed: {e}, fallback to vector search")
        
        return candidates[:top_k]

    async def invalidate_cache(self, pattern: str = "rag:*"):
        if self.redis_cache:
            try:
                await self.redis_cache.delete_pattern(pattern)
            except Exception as e:
                logger.warning(f"Cache clear error: {e}")
