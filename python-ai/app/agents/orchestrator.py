"""Orchestrator - 多 Agent 路由 + 意图识别

根据用户输入识别意图，路由到对应专项 Agent。
针对 5 大痛点设计：
- 痛点 1（中立推荐）→ recommender_agent
- 痛点 2（真实评价）→ marketing_agent（商家端）
- 痛点 3（关键词污染）→ nl_order_agent（多步推理）
- 痛点 4（营销黑箱）→ marketing_agent
- 痛点 5（满减/比价/售后/假打折）→ 4 个 Agent 分管
"""
from typing import Dict, Any, Optional, List
import re
import json


# ==================== 意图分类 ====================

# 意图关键词 - 长关键词优先匹配（权重更高）
INTENT_KEYWORDS = {
    "nl_order": [
        "点个", "点份", "来一份", "要一份", "下单", "订餐",
        "今晚吃", "明天吃", "晚餐", "午餐", "几个人", "预算",
        "点餐", "想要", "想吃", "来份", "点菜", "吃饭"
    ],
    "smart_bargain": [
        "怎么买最划算", "凑单", "凑满", "搭配",
        "便宜点", "省钱", "凑齐", "差多少", "怎么凑", "凑到"
    ],
    "price_compare": [
        "比价", "哪里便宜", "多少钱", "贵不贵", "价格曲线",
        "历史价格", "真打折", "假打折", "价格怎么样", "什么价"
    ],
    "aftersales": [
        "退款", "退货", "少送", "漏发", "没收到",
        "有问题", "投诉", "差评", "售后", "换货"
    ],
    "marketing": [
        "搞个活动", "办个活动", "推送", "分群", "文案",
        "营销", "转化率", "优惠券", "促销", "活动方案", "满减"
    ],
    "recommend": [
        "推荐", "什么好", "买什么", "推荐一下",
        "帮我选", "哪款好", "热门", "有什么"
    ]
}


def classify_intent(message: str, role: str = "user") -> str:
    """识别用户意图 - 长关键词权重更高"""
    if role == "merchant":
        return "marketing"

    scores: Dict[str, int] = {}
    for intent, keywords in INTENT_KEYWORDS.items():
        score = 0
        for kw in keywords:
            if kw in message:
                # 长关键词权重更高（长度 × 2）
                score += len(kw) * 2
        scores[intent] = score

    if not scores or max(scores.values()) == 0:
        return "recommend"

    return max(scores, key=lambda k: scores[k])


def extract_entities(message: str) -> Dict[str, Any]:
    """从用户消息中提取关键实体（人数、预算、时间、品类）"""
    entities = {}

    # 提取人数
    people_match = re.search(r'(\d+)\s*个?人', message)
    if people_match:
        entities["people_count"] = int(people_match.group(1))

    # 提取预算
    budget_match = re.search(r'预算\s*(\d+)', message)
    if budget_match:
        entities["budget"] = int(budget_match.group(1))

    # 提取时间
    time_match = re.search(r'(\d{1,2})\s*点', message)
    if time_match:
        entities["time"] = int(time_match.group(1))

    # 提取荤素汤数量
    entities["meat"] = len(re.findall(r'荤', message))
    entities["veg"] = len(re.findall(r'素|青菜|蔬菜', message))
    entities["soup"] = len(re.findall(r'汤|羹', message))

    return entities


# ==================== Agent 白名单 ====================

AGENT_REGISTRY = {
    "nl_order": {
        "name": "自然语言下单",
        "module": "app.agents.nl_order_agent",
        "class": "NLOrderAgent",
        "description": "解析用户自然语言下单需求，多步推理完成下单",
        "max_token": 8000,
        "tools_count": 12
    },
    "smart_bargain": {
        "name": "智能凑单",
        "module": "app.agents.smart_bargain_agent",
        "class": "SmartBargainAgent",
        "description": "满减规则下的最优凑单组合",
        "max_token": 4000,
        "tools_count": 8
    },
    "price_compare": {
        "name": "智能比价",
        "module": "app.agents.price_compare_agent",
        "class": "PriceCompareAgent",
        "description": "跨品类比价 + 历史价格曲线判断真打折",
        "max_token": 6000,
        "tools_count": 10
    },
    "aftersales": {
        "name": "智能售后",
        "module": "app.agents.aftersales_agent",
        "class": "AftersalesAgent",
        "description": "自动识别少送漏发，自动退款 + 通知商家",
        "max_token": 5000,
        "tools_count": 9
    },
    "marketing": {
        "name": "智能营销",
        "module": "app.agents.marketing_agent",
        "class": "MarketingAgent",
        "description": "商家端用户分群 + 文案生成 + 推送统计",
        "max_token": 8000,
        "tools_count": 11
    },
    "recommend": {
        "name": "中立推荐",
        "module": "app.agents.recommender_agent",
        "class": "RecommenderAgent",
        "description": "中立推荐 + GEO 过滤 + 基于真实评价",
        "max_token": 4000,
        "tools_count": 7
    }
}


# ==================== Orchestrator ====================

class Orchestrator:
    """多 Agent 路由编排器

    职责：
    1. 接收用户消息
    2. 识别意图
    3. 路由到对应 Agent
    4. 返回结果
    """

    def __init__(self):
        self.agents: Dict[str, Any] = {}  # 延迟加载

    async def route(self, message: str, user_id: str = "anonymous",
              role: str = "user", session_id: Optional[str] = None) -> Dict[str, Any]:
        """路由到对应 Agent

        Args:
            message: 用户输入
            user_id: 用户 ID
            role: user / merchant
            session_id: 会话 ID（用于上下文）

        Returns:
            {
                "intent": "nl_order",
                "agent": "自然语言下单",
                "response": "...",
                "entities": {...},
                "tools_used": [...]
            }
        """
        # Step 1: 意图识别（工业级漏斗：关键词快路 → Embedding → LLM 兜底 → OOS）
        intent_conf = 0.0
        intent_method = "keyword"
        try:
            from app.core.intent_classifier import get_intent_classifier
            intent_result = await get_intent_classifier().classify(message, role)
            intent = intent_result["intent"]
            intent_conf = intent_result["confidence"]
            intent_method = intent_result["method"]
        except Exception:
            # 任何 API 故障都降级到关键词识别，保证聊天不中断
            intent = classify_intent(message, role)

        # OOS：不路由到任何 Agent，诚实回复
        if intent == "out_of_scope":
            return {
                "intent": "out_of_scope",
                "agent": "未匹配",
                "response": "这个问题我暂时帮不上忙。我可以帮你点菜、凑单、比价、处理售后，或者给商家出运营方案——试试换一种说法？",
                "entities": extract_entities(message),
                "tools_used": [],
                "error": False,
                "intent_confidence": intent_conf,
                "intent_method": intent_method,
            }
        entities = extract_entities(message)

        # Step 2: 加载 Agent（延迟加载）
        if intent not in self.agents:
            self.agents[intent] = self._load_agent(intent)

        # Step 3: 调用 Agent（异步）
        agent = self.agents[intent]
        try:
            result = await agent.run(
                message=message,
                user_id=user_id,
                session_id=session_id or "default",
                entities=entities
            )
        except Exception as e:
            result = {
                "response": f"抱歉，处理出错了：{str(e)}",
                "tools_used": [],
                "error": True
            }

        return {
            "intent": intent,
            "agent": AGENT_REGISTRY[intent]["name"],
            "response": result.get("response", ""),
            "entities": entities,
            "tools_used": result.get("tools_used", []),
            "error": result.get("error", False),
            "intent_confidence": intent_conf,
            "intent_method": intent_method,
        }

    def _load_agent(self, intent: str):
        """延迟加载 Agent 实例"""
        from app.agents.nl_order_agent import NLOrderAgent
        from app.agents.smart_bargain_agent import SmartBargainAgent
        from app.agents.price_compare_agent import PriceCompareAgent
        from app.agents.aftersales_agent import AftersalesAgent
        from app.agents.marketing_agent import MarketingAgent
        from app.agents.recommender_agent import RecommenderAgent

        agent_map = {
            "nl_order": NLOrderAgent,
            "smart_bargain": SmartBargainAgent,
            "price_compare": PriceCompareAgent,
            "aftersales": AftersalesAgent,
            "marketing": MarketingAgent,
            "recommend": RecommenderAgent
        }

        agent_class = agent_map[intent]
        return agent_class()

    def list_agents(self) -> List[Dict[str, Any]]:
        """列出所有可用 Agent（用于调试）"""
        return [
            {
                "intent": intent,
                **info
            }
            for intent, info in AGENT_REGISTRY.items()
        ]


# 全局单例
_orchestrator_instance: Optional[Orchestrator] = None


def get_orchestrator() -> Orchestrator:
    """获取 Orchestrator 单例"""
    global _orchestrator_instance
    if _orchestrator_instance is None:
        _orchestrator_instance = Orchestrator()
    return _orchestrator_instance
