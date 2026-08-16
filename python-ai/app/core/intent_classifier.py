"""工业级意图识别：多层漏斗

分层设计（生产系统常用套路）：
1. 关键词快路（成本最低，处理非常明确的表达）
2. Embedding 相似度分类（把句子映射成向量，和每个意图的"原型例句"比对，得到置信度）
3. LLM 少样本兜底（低置信度/模棱两可时才调用大模型，带每个意图的示例做 few-shot）
4. OOS 检测（out-of-scope：用户说的不在任何意图里，要诚实说"不会"，而不是硬猜）

阈值、例句、意图定义都集中在文件顶部，方便以后用真实标注数据迭代。
"""
import asyncio
import json
import math
import re
from typing import Dict, List, Optional, Tuple

import httpx
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

from app.config import settings


# ==================== 意图定义与例句（few-shot 原型） ====================

INTENT_EXAMPLES: Dict[str, List[str]] = {
    "nl_order": [
        "帮我点两个菜，预算 50",
        "今晚三个人吃饭，要两个荤一个素",
        "来一份辣椒炒肉和两碗米饭",
        "点个辣一点的菜，别超过 40 块",
        "明天中午 4 个人，预算 150，帮忙安排",
        "我要下单，2 个农家小炒肉",
        "晚餐想吃湘菜，三个人，一百块以内",
        "帮我在 6 点前订好餐，两人份",
    ],
    "smart_bargain": [
        "怎么凑单最划算，满 100 减 20",
        "还差多少钱能用到这张券",
        "帮我凑到 50 块，多点便宜菜",
        "满减怎么搭配最省钱",
        "还差 8 块钱才够门槛，推荐个菜凑上",
        "凑单神器，帮我看看加什么",
    ],
    "price_compare": [
        "这个菜最近是涨价了还是降价了",
        "历史价格看看是不是假打折",
        "辣椒炒肉现在买贵不贵",
        "帮我比比哪个套餐更划算",
        "这家店是不是先涨价再打折",
        "90 天价格曲线给我看看",
    ],
    "aftersales": [
        "我要退款，菜少送了",
        "订单漏发了一瓶饮料，怎么办",
        "餐有问题，我要投诉",
        "没收到外卖，帮我查一下",
        "退款什么时候到账",
        "少送了一个菜，申请售后",
    ],
    "marketing": [
        "帮我写个母亲节活动文案",
        "给老用户分群做个推送方案",
        "新店开业搞什么活动好",
        "帮我策划一个满减促销",
        "怎么提升转化率，给点建议",
        "写一段优惠券推广文案",
    ],
    "recommend": [
        "有什么招牌菜推荐吗",
        "不知道吃啥，帮我推荐",
        "今天想喝点什么，推荐一下",
        "这家店什么最好吃",
        "推荐几个下饭的菜",
        "第一次来，有什么必点",
    ],
}

OOS_EXAMPLES: List[str] = [
    "今天天气怎么样",
    "讲个笑话",
    "你会写代码吗",
    "1+1 等于几",
    "你叫什么名字",
    "帮我翻译一段英文",
]

# ==================== 稀疏特征（学Rasa CountVectors）====================

# 稀疏特征:词n-gram(学Rasa的CountVectorsFeaturizer)
_SPARSE_VECTORIZER = CountVectorizer(
    analyzer='char_wb',  # 字符级n-gram,适合中文
    ngram_range=(2, 4),  # 2-4字gram,捕捉"我要下单""帮我点餐"这种动作短语
)

# 预先拟合所有意图例句
_ALL_EXAMPLES: List[str] = []
_EXAMPLE_LABELS: List[str] = []
for _intent, _examples in INTENT_EXAMPLES.items():
    for _ex in _examples:
        _ALL_EXAMPLES.append(_ex)
        _EXAMPLE_LABELS.append(_intent)
_SPARSE_VECTORIZER.fit(_ALL_EXAMPLES)


def sparse_similarity(message: str) -> Dict[str, float]:
    """稀疏特征相似度:学Rasa的CountVectors,捕捉动作短语"""
    msg_vec = _SPARSE_VECTORIZER.transform([message])
    ex_vecs = _SPARSE_VECTORIZER.transform(_ALL_EXAMPLES)
    sims = cosine_similarity(msg_vec, ex_vecs)[0]

    # 按意图聚合最大相似度
    result: Dict[str, float] = {}
    for i, label in enumerate(_EXAMPLE_LABELS):
        if label not in result or sims[i] > result[label]:
            result[label] = float(sims[i])
    return result


# ==================== 规则快路（学Rasa Rule Policy）====================

# 规则快路:学Rasa的Rule Policy,强动作词直接命中
STRONG_RULES: Dict[str, List[str]] = {
    "nl_order": [
        r"我要?下单", r"帮我?点(餐|菜)", r"来一份", r"点个",
        r"订餐", r"帮我?安排", r"来两?个",
    ],
    "marketing": [
        r"搞?个?活动", r"策划.*促销", r"活动文案", r"推广方案",
        r"营销", r"满减活动",
    ],
    "aftersales": [
        r"退款", r"退货", r"投诉", r"少送", r"漏发", r"还没到",
        r"取消订单", r"取消点?餐", r"不要了", r"申请售后",
    ],
}


def rule_fast_path(message: str) -> Optional[str]:
    """规则快路:命中强动作词直接返回意图,跳过embedding"""
    for intent, patterns in STRONG_RULES.items():
        for pattern in patterns:
            if re.search(pattern, message):
                return intent
    return None


# ==================== 阈值（先用测试标定，再上真实数据调优） ====================

EMBED_THRESHOLD_HIGH = 0.80   # 最高相似度达到它 → 直接采用（置信）
EMBED_THRESHOLD_LOW = 0.70    # 达到它且和次高意图拉开差距 → 采用
EMBED_MARGIN = 0.05           # 与第二意图的最小差距
LLM_CONFIDENCE_THRESHOLD = 0.55  # LLM 自评置信度低于它 → 视为 OOS/无法确定


# ==================== 意图别名归一化 ====================

INTENT_ALIASES = {
    "nl_order": {"nl_order", "自然语言下单", "下单", "点菜", "点餐", "订餐", "帮我下单"},
    "smart_bargain": {"smart_bargain", "智能凑单", "凑单", "凑满", "满减组合", "搭配省钱"},
    "price_compare": {"price_compare", "智能比价", "比价", "价格", "真打折", "历史价格", "贵不贵"},
    "aftersales": {"aftersales", "智能售后", "售后", "退款", "退货", "投诉", "少送", "漏发"},
    "marketing": {"marketing", "智能营销", "营销", "活动文案", "活动策划", "商家运营", "推送"},
    "recommend": {"recommend", "中立推荐", "推荐", "不知道吃什么", "什么好吃"},
    "out_of_scope": {"out_of_scope", "oos", "无关", "闲聊", "其他", "不知道", "不会"},
}

_ALIAS_TO_INTENT = {alias: intent for intent, aliases in INTENT_ALIASES.items() for alias in aliases}


def _normalize_llm_intent(raw: str) -> str:
    """把 LLM 返回的意图名（可能是中文/英文/编号）归一化成标准键"""
    if not raw:
        return "out_of_scope"
    text = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if text in _ALIAS_TO_INTENT:
        return _ALIAS_TO_INTENT[text]
    # 模糊匹配：包含关键词即可
    for intent, aliases in INTENT_ALIASES.items():
        for alias in aliases:
            if alias in text or text in alias:
                return intent
    return "out_of_scope"


def _cosine(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return dot / (na * nb)


def _keyword_fast_path(message: str, role: str = "user") -> Optional[Tuple[str, float]]:
    """关键词快路：复用 orchestrator 的计分逻辑，但只在高分且优势明显时返回"""
    from app.agents.orchestrator import classify_intent, INTENT_KEYWORDS

    if role == "merchant":
        return "marketing", 1.0

    scores: Dict[str, int] = {}
    for intent, keywords in INTENT_KEYWORDS.items():
        score = 0
        for kw in keywords:
            if kw in message:
                score += len(kw) * 2
        if score:
            scores[intent] = score
    if not scores:
        return None

    ranked = sorted(scores.items(), key=lambda x: -x[1])
    top, second = ranked[0], (ranked[1] if len(ranked) > 1 else ("", 0))
    # 高分且领先一倍以上才走快路；否则交给向量/LLM
    if top[1] >= 20 and top[1] >= second[1] * 2 + 4:
        confidence = min(1.0, 0.5 + top[1] / 100.0)
        return top[0], confidence
    return None


# ==================== 工业级分类器 ====================

class IndustrialIntentClassifier:
    """多层漏斗意图分类器"""

    def __init__(self):
        from app.core.embedding import get_embedding
        self.embedding = get_embedding()
        self._prototypes: Optional[List[Tuple[str, List[float]]]] = None
        self._embedding_available = True   # 熔断：API 失败一次后跳过 Embedding 层
        self._embedding_warned = False

    # ---------- Embedding 原型 ----------
    async def _load_prototypes(self) -> List[Tuple[str, List[float]]]:
        if self._prototypes is not None:
            return self._prototypes
        texts: List[str] = []
        labels: List[str] = []
        for intent, examples in INTENT_EXAMPLES.items():
            for ex in examples:
                texts.append(ex)
                labels.append(intent)
        for ex in OOS_EXAMPLES:
            texts.append(ex)
            labels.append("out_of_scope")
        vectors = await self.embedding.embed_batch(texts)
        self._prototypes = list(zip(labels, vectors))
        return self._prototypes

    async def _embedding_classify(self, message: str) -> Tuple[Optional[str], float, Dict[str, float]]:
        """把用户句子和每个意图的原型例句比相似度，返回 (意图, 置信度, 各意图最高分)"""
        prototypes = await self._load_prototypes()
        q = await self.embedding.embed(message)
        intent_scores: Dict[str, float] = {}
        for label, vec in prototypes:
            s = _cosine(q, vec)
            if s > intent_scores.get(label, 0.0):
                intent_scores[label] = s
        ranked = sorted(intent_scores.items(), key=lambda x: -x[1])
        top_intent, top_score = ranked[0]
        second_score = ranked[1][1] if len(ranked) > 1 else 0.0

        # 即使分数很高，如果和第二意图接近平局（差距 < EMBED_MARGIN），交给 LLM 仲裁
        if (top_score >= EMBED_THRESHOLD_HIGH or top_score >= EMBED_THRESHOLD_LOW) \
                and (top_score - second_score) >= EMBED_MARGIN:
            return top_intent, top_score, intent_scores
        return None, top_score, intent_scores

    # ---------- LLM 少样本兜底 ----------
    def _build_llm_prompt(self, message: str) -> List[Dict[str, str]]:
        intent_desc = {
            "nl_order": "用户要点菜/订餐/下单，包含人数、预算、菜品、时间等信息",
            "smart_bargain": "用户想凑单、满减、省钱搭配，或问还差多少钱满门槛",
            "price_compare": "用户想问价格、比价、历史价格、是不是假打折",
            "aftersales": "用户要退款、退货、投诉、少送漏发、售后问题",
            "marketing": "用户（商家）要活动策划、文案、推送、分群、促销方案",
            "recommend": "用户不知道该吃什么，要求推荐菜品",
        }
        lines = []
        for intent, desc in intent_desc.items():
            examples = INTENT_EXAMPLES[intent][:2]
            ex_str = "；".join(examples)
            lines.append(f"- {intent}：{desc}。例句：{ex_str}")
        system = (
            "你是电商点餐场景的意图识别器。只能从以下意图里选一个：\n"
            + "\n".join(lines)
            + "\n- out_of_scope：与点餐/购物/售后/营销完全无关的闲聊或问题。"
            "\n\n规则：先判断是否 out_of_scope；多意图时选最可能的一个；"
            "严格输出 JSON：{\"intent\": \"意图键名\", \"confidence\": 0到1的小数, \"reason\": \"一句话理由\"}。"
        )
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": f"请判断下面这句话的意图：\n{message}"},
        ]

    async def _llm_classify(self, message: str) -> Tuple[str, float, str]:
        """LLM 少样本兜底；失败时返回 ('out_of_scope', 0.0, 'llm_error')"""
        api_key = settings.LLM_API_KEY or settings.ZHIPU_API_KEY
        url = f"{settings.LLM_API_URL.rstrip('/')}/chat/completions"
        payload = {
            "model": settings.LLM_MODEL,
            "messages": self._build_llm_prompt(message),
            "temperature": 0.0,
            "max_tokens": 200,
            "response_format": {"type": "json_object"},
        }
        content = None
        last_err = ""
        for attempt in range(2):  # 偶发失败重试一次
            try:
                async with httpx.AsyncClient(timeout=20) as client:
                    resp = await client.post(
                        url,
                        json=payload,
                        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    )
                    resp.raise_for_status()
                    content = resp.json()["choices"][0]["message"]["content"]
                break
            except Exception as e:
                last_err = str(e)
        if content is None:
            return "out_of_scope", 0.0, f"llm_error: {last_err}"

        m = re.search(r"\{.*\}", content, re.S)
        if not m:
            return "out_of_scope", 0.0, "parse_error"
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return "out_of_scope", 0.0, "json_parse_error"

        intent = _normalize_llm_intent(str(data.get("intent", "")))
        try:
            confidence = float(data.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        reason = str(data.get("reason", ""))[:200]
        if intent == "out_of_scope":
            return intent, max(confidence, 0.6), reason
        if confidence < LLM_CONFIDENCE_THRESHOLD:
            return "out_of_scope", confidence, reason
        return intent, confidence, reason

    # ---------- 总入口 ----------
    async def classify(self, message: str, role: str = "user") -> Dict:
        """多层漏斗总入口（改造版：规则快路 + 稀疏特征 + 混合打分 + Fallback）

        流程（学 Rasa 4 原则）：
        1. 规则快路（Rule Policy，强动作词直接命中，优先级最高）
        2. 关键词快路（原有逻辑，高分且领先才走）
        3. Embedding + 稀疏特征混合打分（CountVectors 拉回被带偏的判断）
        4. LLM 少样本兜底（Fallback Policy）
        """
        message = (message or "").strip()
        if not message:
            return {"intent": "out_of_scope", "confidence": 0.0, "method": "empty", "scores": {}, "reason": "空消息"}

        if role == "merchant":
            return {"intent": "marketing", "confidence": 1.0, "method": "role_based", "scores": {}, "reason": "商家角色直接路由到营销"}

        # 第 1 层：规则快路（学 Rasa Rule Policy，强动作词直接命中）
        rule_intent = rule_fast_path(message)
        if rule_intent:
            return {
                "intent": rule_intent,
                "confidence": 1.0,
                "method": "rule_fast_path",
                "scores": {},
                "reason": f"命中强规则: {rule_intent}",
            }

        # 第 2 层：关键词快路（原有逻辑）
        fast = _keyword_fast_path(message, role)
        if fast:
            intent, conf = fast
            return {"intent": intent, "confidence": conf, "method": "keyword", "scores": {}, "reason": "关键词快路"}

        # 第 3 层：Embedding + 稀疏特征混合打分（学 Rasa CountVectors）
        dense_scores: Dict[str, float] = {}
        embed_top_score = 0.0
        if self._embedding_available:
            try:
                _, embed_top_score, dense_scores = await self._embedding_classify(message)
            except Exception as e:
                self._embedding_available = False
                if not self._embedding_warned:
                    self._embedding_warned = True
                    print(f"[intent_classifier] Embedding 层不可用，已熔断（{e}），后续全部走 LLM/关键词")

        sparse_scores = sparse_similarity(message)

        # 混合打分（稠密 60% + 稀疏 40%）
        combined: Dict[str, float] = {}
        for intent_key in INTENT_EXAMPLES:
            combined[intent_key] = (
                0.6 * dense_scores.get(intent_key, 0.0)
                + 0.4 * sparse_scores.get(intent_key, 0.0)
            )

        best_intent = max(combined, key=lambda k: combined[k])
        best_score = combined[best_intent]

        # 混合分达到阈值 → 直接采用（学 Rasa Fallback 的阈值判断）
        if best_score >= 0.55:
            return {
                "intent": best_intent,
                "confidence": round(best_score, 3),
                "method": "hybrid_dense_sparse",
                "scores": {k: round(v, 3) for k, v in combined.items()},
                "reason": "稠密+稀疏混合打分",
            }

        # 第 4 层：LLM 少样本兜底（Fallback Policy）
        llm_intent, llm_conf, reason = await self._llm_classify(message)
        return {
            "intent": llm_intent,
            "confidence": round(llm_conf, 3),
            "method": "llm",
            "scores": {k: round(v, 3) for k, v in combined.items()},
            "reason": reason,
        }


_classifier_instance: Optional[IndustrialIntentClassifier] = None


def get_intent_classifier() -> IndustrialIntentClassifier:
    global _classifier_instance
    if _classifier_instance is None:
        _classifier_instance = IndustrialIntentClassifier()
    return _classifier_instance
