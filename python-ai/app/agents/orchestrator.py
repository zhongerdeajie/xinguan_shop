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
        "便宜点", "省钱", "凑齐", "差多少", "怎么凑", "凑到",
        "预算", "满减", "满100", "满50", "凑一凑",
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
        "帮我选", "哪款好", "热门", "有什么",
        "推荐几个", "好吃", "必点", "招牌菜", "下饭",
    ]
}


# 闲聊/问候/情绪 关键词 - 不属于任何业务意图，走友好回复
CHITCHAT_KEYWORDS = [
    "你好", "您好", "hi", "hello", "嗨", "哈喽", "在吗", "在不在",
    "你是谁", "你叫什么", "介绍一下你", "你是啥", "什么玩意", "啥玩意",
    "谢谢", "感谢", "不客气", "再见", "拜拜", "辛苦", "好的", "嗯",
]


def classify_intent(message: str, role: str = "user") -> str:
    """识别用户意图 - 长关键词权重更高"""
    if role == "merchant":
        return "marketing"

    msg = (message or "").strip()
    if not msg:
        return "chitchat"

    # 闲聊/问候优先（长度很短或命中闲聊词，不应进入业务意图）
    if len(msg) <= 3 or any(kw in msg for kw in CHITCHAT_KEYWORDS):
        return "chitchat"

    scores: Dict[str, int] = {}
    for intent, keywords in INTENT_KEYWORDS.items():
        score = 0
        for kw in keywords:
            if kw in msg:
                # 长关键词权重更高（长度 × 2）
                score += len(kw) * 2
        scores[intent] = score

    if not scores or max(scores.values()) == 0:
        # 无匹配：不再默认 recommend（这是"你好变推荐"的根因）
        return "out_of_scope"

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

        # P0-1 上下文感知：确认词 + 历史上下文 → 路由到对应 Agent
        # 精确匹配：先检查 aftersales 上下文（退款/取消订单），再检查 nl_order 上下文（方案/菜品）
        _confirm_words = ["确认", "下单", "好的", "可以", "确定", "就这个", "选方案", "就要"]
        # 指代/选择词：选第X个 / 就第X个 / 第一个 / 它叫什么 / 再加一份（需结合历史上下文）
        _selection_words = [
            "选第", "选第一个", "选第二个", "选第三个", "选第四个",
            "就第", "就第一个", "就第二个", "就第三个",
            "第一个", "第二个", "第三个", "第四个",
            "选方案", "方案1", "方案2", "方案3", "方案一", "方案二", "方案三",
            "它叫", "这个叫什么", "那个叫什么", "再加", "加一份", "加个", "补一份",
        ]
        _aftersales_confirm_words = ["确认退款", "确认取消", "确定退款", "确定取消", "同意退款"]
        _is_aftersales_confirm = any(w in message for w in _aftersales_confirm_words)
        _is_general_confirm = any(w in message for w in _confirm_words)
        _is_selection = any(w in message for w in _selection_words)
        if (_is_aftersales_confirm or _is_general_confirm or _is_selection) and session_id:
            # 上下文感知分支：尝试读 Redis 历史
            _intent_from_ctx = None
            try:
                from app.agents.base import get_redis
                import json as _json
                _raw = get_redis().lrange(f"chat:history:{session_id}", 0, 4)
                _recent = [_json.loads(r) for r in _raw]
                _assistant_msgs = [item.get("content", "") for item in _recent if item.get("role") == "assistant"]
                _all_ctx = " ".join(_assistant_msgs)
                _has_aftersales_ctx = any(kw in _all_ctx for kw in ["退款", "取消订单", "售后", "退货", "投诉"])
                _has_order_ctx = any(kw in _all_ctx for kw in ["方案", "菜品", "确认下单", "加入购物车", "合计", "推荐", "元", "评分"])
                if _is_selection and not _has_aftersales_ctx:
                    _intent_from_ctx = ("nl_order", 0.9)
                elif _is_aftersales_confirm and _has_aftersales_ctx:
                    _intent_from_ctx = ("aftersales", 0.9)
                elif _has_order_ctx and not _has_aftersales_ctx:
                    _intent_from_ctx = ("nl_order", 0.9)
                elif _has_aftersales_ctx:
                    _intent_from_ctx = ("aftersales", 0.9)
            except Exception:
                pass

            if _intent_from_ctx is not None:
                intent, intent_conf = _intent_from_ctx
                intent_method = "context_aware"
            else:
                # Redis 读不到历史 或 历史不匹配：
                # - 指代/确认词必须路由到对应 Agent，不能降级到 classifier（classifier 会判 OOS/chitchat，丢失上下文）
                # - 让 Agent 内部处理"历史为空"的情况
                if _is_aftersales_confirm:
                    intent = "aftersales"
                    intent_conf = 0.85
                    intent_method = "context_aware_fallback"
                elif _is_selection:
                    intent = "nl_order"
                    intent_conf = 0.85
                    intent_method = "context_aware_fallback"
                else:
                    # _is_general_confirm: 历史不匹配时，退回给 classifier（可能是真的没上下文）
                    try:
                        from app.core.intent_classifier import get_intent_classifier
                        intent_result = await get_intent_classifier().classify(message, role)
                        intent = intent_result["intent"]
                        intent_conf = intent_result["confidence"]
                        intent_method = intent_result["method"]
                    except Exception:
                        intent = classify_intent(message, role)
        else:
            try:
                from app.core.intent_classifier import get_intent_classifier
                intent_result = await get_intent_classifier().classify(message, role)
                intent = intent_result["intent"]
                intent_conf = intent_result["confidence"]
                intent_method = intent_result["method"]
            except Exception:
                # 任何 API 故障都降级到关键词识别，保证聊天不中断
                intent = classify_intent(message, role)

        # OOS / 闲聊：不路由到任何 Agent，走 Fallback 兜底（学 Rasa Fallback Policy）
        if intent in ("out_of_scope", "chitchat"):
            # 闲聊友好回复（你好/你是谁/谢谢/再见 等）
            if intent == "chitchat":
                chitchat_reply = self._build_chitchat_reply(message)
                return {
                    "intent": "chitchat",
                    "agent": "chitchat",
                    "response": chitchat_reply,
                    "entities": extract_entities(message),
                    "tools_used": [],
                    "order_suggestion": None,
                    "error": False,
                    "intent_confidence": intent_conf,
                    "intent_method": intent_method,
                }
            return {
                "intent": "out_of_scope",
                "agent": "fallback",
                "response": (
                    "抱歉，我好像没太理解您的意思。您可以试试：\n"
                    "• 说『我要下单』+ 菜名 来点餐\n"
                    "• 说『预算XX元帮我凑单』来凑单\n"
                    "• 说『推荐几个菜』来获取推荐"
                ),
                "entities": extract_entities(message),
                "tools_used": [],
                "order_suggestion": None,
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
        # 把 Redis 里的历史传给 Agent，用于指代消解（选第X个/它叫什么/再加一份）
        _history_for_agent: List[Dict[str, str]] = []
        if session_id:
            try:
                from app.agents.base import get_redis
                import json as _json2
                _raw_h = get_redis().lrange(f"chat:history:{session_id}", 0, 9)
                for r in _raw_h:
                    _item = _json2.loads(r)
                    _history_for_agent.append({
                        "role": _item.get("role", "assistant"),
                        "content": _item.get("content", ""),
                    })
            except Exception:
                pass

        try:
            result = await agent.run(
                message=message,
                user_id=user_id,
                session_id=session_id or "default",
                entities=entities,
                history=_history_for_agent,
            )
        except TypeError:
            # Agent 旧签名不支持 history 参数（向后兼容）
            result = await agent.run(
                message=message,
                user_id=user_id,
                session_id=session_id or "default",
                entities=entities,
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

    @staticmethod
    def _build_chitchat_reply(message: str) -> str:
        """闲聊友好回复：你好/你是谁/谢谢/再见 等"""
        msg = (message or "").strip().lower()
        if any(kw in msg for kw in ["你好", "您好", "hi", "hello", "嗨", "哈喽", "在吗", "在不在"]):
            return (
                "你好！我是星选 AI 点餐助手 🤖\n"
                "可以帮你：\n"
                "• 🍽️ 推荐菜品（说『推荐几个菜』）\n"
                "• 🛒 自然语言下单（说『我要下单 辣椒炒肉』）\n"
                "• 💰 预算凑单（说『预算50元帮我凑单』）\n"
                "• 🔍 价格比价（说『辣椒炒肉贵不贵』）\n"
                "试试上面的说法吧！"
            )
        if any(kw in msg for kw in ["你是谁", "你叫什么", "介绍一下", "你是啥", "介绍下自己"]):
            return (
                "我是星选 AI 点餐助手 🤖\n"
                "基于智谱 GLM 大模型，我可以帮你：\n"
                "• 推荐评分最高的菜品\n"
                "• 用自然语言下单\n"
                "• 按预算智能凑单\n"
                "• 查询菜品历史价格\n"
                "有什么想吃的吗？"
            )
        if any(kw in msg for kw in ["谢谢", "感谢", "辛苦", "不客气"]):
            return "不客气！有需要随时找我 😊"
        if any(kw in msg for kw in ["再见", "拜拜", "88"]):
            return "再见！欢迎下次再来点餐 🥡"
        return (
            "我在的！您可以直接告诉我你想吃什么、预算多少，"
            "我会帮你推荐、凑单和比价。"
        )

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
