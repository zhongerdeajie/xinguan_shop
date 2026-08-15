"""真实数据驱动的 RAG 文档加载"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent


def build_rag_documents() -> list:
    """优先加载真实数据 RAG，回退到 mock 数据"""
    real_path = DATA_DIR / "real_rag_documents.json"
    if real_path.exists():
        with open(real_path, encoding="utf-8") as f:
            docs = json.load(f)
        return docs
    return []


def get_real_documents_count() -> int:
    real_path = DATA_DIR / "real_rag_documents.json"
    if real_path.exists():
        with open(real_path, encoding="utf-8") as f:
            return len(json.load(f))
    return 0
