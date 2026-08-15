"""轻量级向量存储 - 纯 Python 实现，无需 ONNX"""
import os
import json
import numpy as np
from typing import List, Dict, Any, Optional
import hashlib
import time

from app.config import settings


class SimpleVectorStore:
    """纯内存向量存储 - 使用 MiniMax embo-01 embedding + NumPy 余弦相似度"""

    def __init__(self, api_key: str, cache_file: str = "/app/app/data/vectors.npz"):
        self.api_key = api_key
        self.cache_file = cache_file
        self.documents: List[Dict[str, Any]] = []
        self.vectors: List[np.ndarray] = []
        self._dirty = False
        self._load_cache()

    def _load_cache(self):
        """从磁盘加载缓存的向量"""
        if os.path.exists(self.cache_file):
            try:
                data = np.load(self.cache_file, allow_pickle=True)
                self.vectors = [data[f"vec_{i}"] for i in range(len(data.files))]
                meta_file = self.cache_file.replace(".npz", ".json")
                if os.path.exists(meta_file):
                    with open(meta_file, "r", encoding="utf-8") as f:
                        self.documents = json.load(f)
                    print(f"[VectorStore] 从缓存加载 {len(self.documents)} 篇文档")
            except Exception as e:
                print(f"[VectorStore] 缓存加载失败: {e}")

    def _save_cache(self):
        """保存向量到磁盘"""
        if not self._dirty:
            return
        try:
            vec_dict = {f"vec_{i}": v for i, v in enumerate(self.vectors)}
            np.savez(self.cache_file, **vec_dict)
            meta_file = self.cache_file.replace(".npz", ".json")
            with open(meta_file, "w", encoding="utf-8") as f:
                json.dump(self.documents, f, ensure_ascii=False)
            self._dirty = False
            print(f"[VectorStore] 缓存已保存 ({len(self.documents)} 篇)")
        except Exception as e:
            print(f"[VectorStore] 缓存保存失败: {e}")

    def _embed(self, texts: List[str], etype: str = "db") -> List[List[float]]:
        """使用 MiniMax embo-01 embedding，每 10 条一个请求批量嵌入（文档 db / 查询 query）"""
        import requests
        results: List[List[float]] = []
        chunk_size = 10
        for i in range(0, len(texts), chunk_size):
            batch = [t[:512] for t in texts[i:i + chunk_size]]
            try:
                resp = requests.post(
                    settings.MINIMAX_EMBEDDING_URL,
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={"model": settings.MINIMAX_EMBEDDING_MODEL, "type": etype, "texts": batch},
                    timeout=30,
                )
                data = resp.json()
                vectors = data.get("vectors")
                if vectors and len(vectors) == len(batch):
                    results.extend(vectors)
                else:
                    base = data.get("base_resp", {})
                    print(f"[VectorStore] embedding 失败: {base.get('status_code')} {base.get('status_msg')}")
                    results.extend([[0.0] * settings.EMBEDDING_DIM] * len(batch))
            except Exception as e:
                print(f"[VectorStore] embedding 失败: {e}")
                results.extend([[0.0] * settings.EMBEDDING_DIM] * len(batch))
        return results

    def add(self, documents: List[Dict[str, Any]]):
        """添加文档并计算 embedding"""
        if not documents:
            return
        texts = [d.get("content", "") for d in documents]
        vectors = self._embed(texts, etype="db")
        for doc, vec in zip(documents, vectors):
            self.documents.append(doc)
            self.vectors.append(np.array(vec, dtype=np.float32))
        self._dirty = True
        self._save_cache()
        print(f"[VectorStore] 已索引 {len(self.documents)} 篇文档")

    def search(self, query: str, top_k: int = 5, entity_type: str = None) -> List[Dict]:
        """余弦相似度检索"""
        if not self.vectors:
            return []
        
        # 计算 query embedding
        query_vec = np.array(self._embed([query], etype="query")[0], dtype=np.float32)
        
        # 计算余弦相似度
        matrix = np.stack(self.vectors)
        # 归一化
        query_norm = query_vec / (np.linalg.norm(query_vec) + 1e-8)
        matrix_norm = matrix / (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-8)
        scores = matrix_norm @ query_norm
        
        # 过滤 entity_type
        indices = list(range(len(self.documents)))
        if entity_type:
            indices = [i for i in indices if self.documents[i].get("entity_type") == entity_type]
        
        # 取 top_k
        indexed_scores = [(i, float(scores[i])) for i in indices]
        indexed_scores.sort(key=lambda x: x[1], reverse=True)
        
        results = []
        for i, score in indexed_scores[:top_k]:
            doc = self.documents[i]
            results.append({
                "doc_id": doc.get("doc_id", i),
                "entity_type": doc.get("entity_type", ""),
                "entity_id": doc.get("entity_id", 0),
                "content": doc.get("content", ""),
                "score": round(score, 4),
            })
        return results

    def count(self) -> int:
        return len(self.documents)

    def clear(self):
        self.documents.clear()
        self.vectors.clear()
        self._dirty = True
        self._save_cache()
