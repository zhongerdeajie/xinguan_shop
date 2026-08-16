"""Qdrant 向量数据库（P1-1）- 替换 SimpleVectorStore

核心优势：
- 数据持久化到磁盘，容器重启不丢
- HTTP API，独立容器运行
- 支持 payload 过滤（按 entity_type 筛选）
- 接口与 SimpleVectorStore 兼容（add/search/count）

参考项目：qdrant/qdrant（GitHub Star 20k+）
文档：qdrant.tech/documentation
"""
import os
import math
from typing import List, Dict, Any, Optional

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)


COLLECTION_NAME = "xinguan_dishes"


class QdrantVectorStore:
    """Qdrant 向量存储（接口兼容 SimpleVectorStore）"""

    def __init__(self, api_key: str = "", cache_file: str = ""):
        # api_key 和 cache_file 参数保留以兼容 main.py 的调用方式
        self.api_key = api_key
        self.client = QdrantClient(
            url=os.getenv("QDRANT_URL", "http://qdrant:6333")
        )
        self._dim = int(os.getenv("EMBEDDING_DIM", "1536"))
        self._ensure_collection()

    def _ensure_collection(self):
        """确保 collection 存在，不存在则创建"""
        collections = self.client.get_collections()
        names = [c.name for c in collections.collections]
        if COLLECTION_NAME not in names:
            self.client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(
                    size=self._dim,
                    distance=Distance.COSINE,
                ),
            )
            print(f"[Qdrant] 创建 collection: {COLLECTION_NAME} (dim={self._dim})")

    def add(self, documents: List[Dict[str, Any]]) -> None:
        """添加文档向量（兼容 SimpleVectorStore.add）

        documents 格式: [{"doc_id": 1, "embedding": [...], "entity_type": "dish", "content": "..."}, ...]
        """
        if not documents:
            return

        points = []
        for i, doc in enumerate(documents):
            vec = doc.get("embedding") or doc.get("vector")
            if not vec:
                continue
            point_id = doc.get("doc_id") or doc.get("id") or (i + 1)
            payload = {
                "content": doc.get("content", ""),
                "entity_type": doc.get("entity_type", "dish"),
                "doc_id": point_id,
            }
            # 保留额外字段
            for k, v in doc.items():
                if k not in ("embedding", "vector", "doc_id", "id", "content", "entity_type"):
                    payload[k] = v
            points.append(
                PointStruct(id=point_id, vector=vec, payload=payload)
            )

        if points:
            self.client.upsert(
                collection_name=COLLECTION_NAME,
                points=points,
            )
            print(f"[Qdrant] 写入 {len(points)} 条向量")

    def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        entity_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """向量搜索（兼容 SimpleVectorStore.search）

        Args:
            query_vector: 查询向量（embedding）
            top_k: 返回前 K 条
            entity_type: 按 entity_type 过滤（dish/review/...）

        Returns:
            [{"doc_id": 1, "content": "...", "score": 0.95, "entity_type": "dish"}, ...]
        """
        query_filter = None
        if entity_type:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="entity_type",
                        match=MatchValue(match=entity_type),
                    )
                ]
            )

        results = self.client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            limit=top_k,
            query_filter=query_filter,
        )

        items = []
        for point in results.points:
            items.append(
                {
                    "doc_id": point.payload.get("doc_id", point.id),
                    "content": point.payload.get("content", ""),
                    "entity_type": point.payload.get("entity_type", ""),
                    "score": point.score,
                }
            )
        return items

    def count(self) -> int:
        """返回向量总数（兼容 SimpleVectorStore.count）"""
        try:
            info = self.client.get_collection(COLLECTION_NAME)
            return info.points_count or 0
        except Exception:
            return 0
