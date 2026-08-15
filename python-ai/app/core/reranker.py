"""BGE-rerank-base 重排序模块

使用 HuggingFace transformers 加载 BGE 交叉编码器模型，
对初步检索结果进行精确重排序。

模型：BAAI/bge-reranker-base（768 维，330M 参数）
加载策略：延迟加载 + 本地缓存，首次使用自动下载
"""
import os
import time
import logging
from typing import List, Dict, Any, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# 禁用代理，避免 HuggingFace 下载被拦截
for _k in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]:
    os.environ.pop(_k, None)

# HuggingFace 镜像（中国大陆加速）
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")


class BGEReranker:
    """BGE-rerank-base 交叉编码器重排序器

    使用方式：
        reranker = BGEReranker()
        reranker.load_model()  # 延迟加载
        results = reranker.rerank(query, documents, top_k=5)
    """

    MODEL_NAME = "BAAI/bge-reranker-base"
    CACHE_DIR = "/app/app/data/model_cache"
    MAX_LENGTH = 512

    _instance: Optional["BGEReranker"] = None
    _model = None
    _tokenizer = None
    _loaded = False
    _load_error: Optional[str] = None

    def __new__(cls):
        """单例模式，避免重复加载模型"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        pass

    def load_model(self, force: bool = False) -> bool:
        """加载 BGE-rerank-base 模型

        Args:
            force: 强制重新加载

        Returns:
            是否加载成功
        """
        if self._loaded and not force:
            return True

        if self._load_error and not force:
            logger.warning(f"BGE 模型上次加载失败: {self._load_error}，跳过")
            return False

        try:
            logger.info(f"[BGE] 正在加载 {self.MODEL_NAME}...")
            start = time.time()

            from transformers import AutoModelForSequenceClassification, AutoTokenizer

            os.makedirs(self.CACHE_DIR, exist_ok=True)

            self._tokenizer = AutoTokenizer.from_pretrained(
                self.MODEL_NAME,
                cache_dir=self.CACHE_DIR,
                trust_remote_code=True,
            )
            self._model = AutoModelForSequenceClassification.from_pretrained(
                self.MODEL_NAME,
                cache_dir=self.CACHE_DIR,
                trust_remote_code=True,
            )
            self._model.eval()  # 推理模式

            elapsed = time.time() - start
            logger.info(f"[BGE] 模型加载完成，耗时 {elapsed:.1f}s")
            self._loaded = True
            self._load_error = None
            return True

        except Exception as e:
            self._load_error = str(e)
            logger.error(f"[BGE] 模型加载失败: {e}")
            logger.warning("[BGE] 将回退到余弦相似度排序")
            return False

    def is_loaded(self) -> bool:
        """检查模型是否已加载"""
        return self._loaded

    def rerank(self, query: str, documents: List[Dict[str, Any]],
               top_k: int = 5, content_key: str = "content") -> List[Dict[str, Any]]:
        """对文档列表进行重排序

        Args:
            query: 用户查询
            documents: 待重排序文档列表，每个文档是 dict，必须包含 content_key 字段
            top_k: 返回前 k 个结果
            content_key: 文档内容字段名

        Returns:
            重排序后的文档列表，新增 'rerank_score' 字段
        """
        if not documents:
            return []

        # 如果模型未加载，尝试加载
        if not self._loaded:
            if not self.load_model():
                # 加载失败，回退到原始顺序（保持 SimpleVectorStore 的相似度排序）
                logger.warning("[BGE] 模型不可用，跳过重排序")
                return documents[:top_k]

        try:
            # 构造 (query, doc) 对
            pairs = []
            for doc in documents:
                text = doc.get(content_key, "")
                # 截断过长文本
                if len(text) > self.MAX_LENGTH * 2:
                    text = text[:self.MAX_LENGTH * 2]
                pairs.append((query, text))

            # 批量推理
            scores = self._infer_pairs(pairs)

            # 将分数添加到文档
            for doc, score in zip(documents, scores):
                doc["rerank_score"] = round(float(score), 4)

            # 按 rerank_score 降序排列
            documents.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)

            return documents[:top_k]

        except Exception as e:
            logger.error(f"[BGE] 重排序失败: {e}")
            return documents[:top_k]

    def _infer_pairs(self, pairs: List[Tuple[str, str]]) -> List[float]:
        """模型推理

        Args:
            pairs: [(query, doc_text), ...]

        Returns:
            每个 pair 的相关性分数
        """
        import torch

        # Tokenize
        inputs = self._tokenizer(
            [p[0] for p in pairs],  # queries
            [p[1] for p in pairs],  # documents
            padding=True,
            truncation=True,
            max_length=self.MAX_LENGTH,
            return_tensors="pt",
        )

        # 推理
        with torch.no_grad():
            outputs = self._model(**inputs)
            logits = outputs.logits

        # bge-reranker-base 输出单 logit，用 sigmoid 转概率
        if logits.dim() > 1 and logits.shape[1] > 1:
            # 多分类情况（bge-reranker-v2-m3 等）
            scores = torch.softmax(logits, dim=1)[:, 1].tolist()
        else:
            # 单输出情况（bge-reranker-base）
            scores = torch.sigmoid(logits.squeeze()).tolist()

        # 确保返回 list
        if not isinstance(scores, list):
            scores = [float(scores)]

        return scores

    def unload(self):
        """卸载模型，释放内存"""
        self._model = None
        self._tokenizer = None
        self._loaded = False
        BGEReranker._model = None
        BGEReranker._tokenizer = None
        BGEReranker._loaded = False
        logger.info("[BGE] 模型已卸载")


def get_reranker() -> BGEReranker:
    """获取 BGE 重排序器单例"""
    return BGEReranker()
