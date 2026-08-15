"""电商 Agent - 基于 LangGraph 的全链路智能购物助手"""
from typing import List, Dict, Any, Optional, Annotated, TypedDict
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage, AIMessage, trim_messages
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
import os
import json
import logging
import sqlite3
import httpx

from app.config import settings
from app.core.langchain_rag import LangChainRAG
from app.core.simple_vector import SimpleVectorStore
from app.core.go_auth import GoJWTAuth

logger = logging.getLogger(__name__)

# ============ 配置 ============
GO_SERVICE_URL = settings.GO_SERVICE_URL or "http://go-service:8081"
MAX_CONTEXT_TOKENS = 4000  # Token 预算上限


# ============ 状态定义 ============
class EcommerceAgentState(TypedDict):
    """电商 Agent 状态"""
    messages: Annotated[list, add_messages]
    user_message: str
    user_id: Optional[str]
    context: str
    tool_results: list
    token_count: int
    intent: Optional[str]


# ============ 工具定义 ============
def create_ecommerce_tools(rag: LangChainRAG, http_client: httpx.AsyncClient):
    """创建电商 Agent 工具集"""

    @tool
    async def search_products(query: str, category: str = None, min_price: float = None, 
                              max_price: float = None, sort: str = "relevance") -> str:
        """
        搜索商品。支持语义搜索和结构化筛选。
        参数:
            query: 搜索关键词（自然语言）
            category: 商品分类（如"川菜"、"粤菜"、"饮品"）
            min_price: 最低价格
            max_price: 最高价格
            sort: 排序方式 - relevance(相关度), price_asc(价格升序), price_desc(价格降序), rating(评分)
        """
        # 先进行语义检索
        results = await rag.search(query, top_k=8)
        
        # 如果有结构化筛选条件，调用 Go 服务
        if any([category, min_price, max_price]):
            try:
                params = {"query": query}
                if category:
                    params["category"] = category
                if min_price:
                    params["min_price"] = min_price
                if max_price:
                    params["max_price"] = max_price
                if sort != "relevance":
                    params["sort"] = sort
                    
                resp = await http_client.get(f"{GO_SERVICE_URL}/api/v1/dishes", params=params)
                if resp.status_code == 200:
                    go_results = resp.json().get("data", [])
                    # 合并向量检索结果和 Go 服务结果
                    seen_ids = {r.get("id") for r in results}
                    for item in go_results:
                        if item.get("id") not in seen_ids:
                            results.append({
                                "entity_type": "dish",
                                "entity_id": item.get("id"),
                                "content": f"{item.get('name', '未知')} - ¥{item.get('price', 0)} - {item.get('description', '')}",
                                "score": 0.8,
                                "data": item
                            })
            except Exception as e:
                logger.warning(f"Go 服务搜索失败: {e}")
        
        if not results:
            return "没有找到相关商品"
        
        output = []
        for i, r in enumerate(results[:5], 1):
            data = r.get("data", {})
            price = data.get("price", "未知")
            output.append(f"{i}. {r['content']} - ¥{price}")
        
        return "\n".join(output)

    @tool
    async def get_product_detail(product_id: int) -> str:
        """
        获取商品详情信息。
        参数:
            product_id: 商品ID
        """
        try:
            resp = await http_client.get(f"{GO_SERVICE_URL}/api/v1/dishes/{product_id}")
            if resp.status_code == 200:
                dish = resp.json()
                return (
                    f"商品名称: {dish.get('name', '未知')}\n"
                    f"价格: ¥{dish.get('price', 0)}\n"
                    f"分类: {dish.get('categoryId', '未知')}\n"
                    f"描述: {dish.get('description', '无')}\n"
                    f"状态: {'在售' if dish.get('status') == 1 else '停售'}\n"
                    f"图片: {dish.get('image', '无')}"
                )
            return "商品不存在"
        except Exception as e:
            return f"获取商品详情失败: {e}"

    @tool
    async def add_to_cart(product_id: int, quantity: int = 1, user_id: str = None) -> str:
        """
        添加商品到购物车。
        参数:
            product_id: 商品ID
            quantity: 数量（默认1）
            user_id: 用户ID（可选，会从上下文获取）
        """
        if not user_id:
            return "请先登录或提供用户ID"
        
        try:
            payload = {
                "dishId": product_id,
                "number": quantity,
            }
            resp = await http_client.post(f"{GO_SERVICE_URL}/api/v1/cart/add", json=payload)
            if resp.status_code == 200:
                return f"已成功添加 {quantity} 件商品到购物车"
            else:
                return f"添加购物车失败: {resp.text}"
        except Exception as e:
            return f"添加购物车失败: {e}"

    @tool
    async def view_cart(user_id: str = None) -> str:
        """
        查看当前购物车内容。
        参数:
            user_id: 用户ID
        """
        if not user_id:
            return "请先登录或提供用户ID"
        
        try:
            resp = await http_client.get(f"{GO_SERVICE_URL}/api/v1/cart")
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("data", [])
                if not items:
                    return "购物车是空的"
                
                total = 0
                output = ["购物车内容:"]
                for i, item in enumerate(items, 1):
                    subtotal = item.get("amount", 0)
                    total += subtotal
                    output.append(f"{i}. {item.get('name', '商品')} x{item.get('number', 1)} = ¥{subtotal}")
                output.append(f"\n总计: ¥{total:.2f}")
                return "\n".join(output)
            return "获取购物车失败"
        except Exception as e:
            return f"获取购物车失败: {e}"

    @tool
    async def create_order(address_id: int = None, remark: str = "", user_id: str = None) -> str:
        """
        提交订单。
        参数:
            address_id: 收货地址ID
            remark: 备注信息
            user_id: 用户ID
        """
        if not user_id:
            return "请先登录或提供用户ID"
        
        try:
            payload = {
                "addressBookId": address_id,
                "remark": remark
            }
            resp = await http_client.post(
                f"{GO_SERVICE_URL}/api/v1/orders/submit",
                json=payload,
            )
            if resp.status_code == 200:
                data = resp.json()
                order_no = data.get("data", {}).get("orderNumber", "未知")
                total = data.get("data", {}).get("totalAmount", 0)
                return (
                    f"订单创建成功!\n"
                    f"订单号: {order_no}\n"
                    f"总金额: ¥{total}\n"
                    f"请前往支付"
                )
            else:
                return f"订单创建失败: {resp.text}"
        except Exception as e:
            return f"创建订单失败: {e}"

    @tool
    async def pay_order(order_number: str = None, user_id: str = None) -> str:
        """
        支付订单。
        参数:
            order_number: 订单号
            user_id: 用户ID
        """
        if not user_id:
            return "请先登录或提供用户ID"
        
        try:
            payload = {
                "orderNumber": order_number,
                "payMethod": 1
            }
            resp = await http_client.post(
                f"{GO_SERVICE_URL}/api/v1/payment/pay",
                json=payload,
            )
            if resp.status_code == 200:
                return f"订单 {order_number} 支付成功！"
            else:
                return f"支付失败: {resp.text}"
        except Exception as e:
            return f"支付失败: {e}"

    @tool
    async def track_order(order_number: str = None, user_id: str = None) -> str:
        """
        查询订单状态和物流信息。
        参数:
            order_number: 订单号
            user_id: 用户ID
        """
        if not user_id:
            return "请先登录或提供用户ID"
        
        try:
            # 先获取订单列表
            resp = await http_client.get(f"{GO_SERVICE_URL}/api/v1/orders")
            if resp.status_code == 200:
                data = resp.json()
                orders = data.get("data", {}).get("data", [])
                for order in orders:
                    if order.get("orderNumber") == order_number or order.get("number") == order_number:
                        return (
                            f"订单号: {order.get('orderNumber') or order.get('number')}\n"
                            f"状态: {order.get('status', '未知')}\n"
                            f"金额: ¥{order.get('amount', 0)}\n"
                            f"下单时间: {order.get('orderTime', '未知')}\n"
                            f"备注: {order.get('remark', '无')}"
                        )
                return "未找到该订单"
            return "查询订单失败"
        except Exception as e:
            return f"查询订单失败: {e}"

    @tool
    async def get_recommendations(user_id: str = None) -> str:
        """
        获取个性化推荐商品。基于用户历史浏览和购买记录。
        参数:
            user_id: 用户ID
        """
        if not user_id:
            # 获取热门商品推荐
            try:
                resp = await http_client.get(f"{GO_SERVICE_URL}/api/v1/dishes")
                if resp.status_code == 200:
                    dishes = resp.json().get("data", [])
                    popular = dishes[:5]
                    output = ["热门商品推荐:"]
                    for i, dish in enumerate(popular, 1):
                        output.append(f"{i}. {dish.get('name', '未知')} - ¥{dish.get('price', 0)}")
                    return "\n".join(output)
            except:
                pass
        
        # 基于用户历史推荐（简化版）
        try:
            resp = await http_client.get(f"{GO_SERVICE_URL}/api/v1/dishes")
            if resp.status_code == 200:
                dishes = resp.json().get("data", [])
                output = ["为您推荐:"]
                for i, dish in enumerate(dishes[:5], 1):
                    output.append(f"{i}. {dish.get('name', '未知')} - ¥{dish.get('price', 0)}")
                return "\n".join(output)
        except:
            pass
        
        return "暂时无法获取推荐，请稍后再试"

    @tool
    async def compare_products(product_ids: str) -> str:
        """
        对比多个商品的属性、价格等信息。
        参数:
            product_ids: 商品ID列表，用逗号分隔（如 "1,2,3"）
        """
        try:
            ids = [int(x.strip()) for x in product_ids.split(",") if x.strip()]
            products = []
            for pid in ids[:3]:  # 最多对比3个
                resp = await http_client.get(f"{GO_SERVICE_URL}/api/v1/dishes/{pid}")
                if resp.status_code == 200:
                    products.append(resp.json())
            
            if len(products) < 2:
                return "至少需要2个有效商品进行对比"
            
            output = ["商品对比:"]
            output.append("-" * 40)
            for p in products:
                output.append(
                    f"{p.get('name', '未知')}\n"
                    f"  价格: ¥{p.get('price', 0)}\n"
                    f"  分类: {p.get('categoryId', '未知')}\n"
                    f"  描述: {p.get('description', '无')}"
                )
                output.append("-" * 40)
            
            return "\n".join(output)
        except Exception as e:
            return f"商品对比失败: {e}"

    @tool
    async def get_categories() -> str:
        """获取所有商品分类"""
        try:
            resp = await http_client.get(f"{GO_SERVICE_URL}/api/v1/categories")
            if resp.status_code == 200:
                categories = resp.json().get("data", [])
                output = ["商品分类:"]
                for cat in categories:
                    output.append(f"- {cat.get('name', '未知')} (ID: {cat.get('id')})")
                return "\n".join(output)
            return "获取分类失败"
        except Exception as e:
            return f"获取分类失败: {e}"

    @tool
    async def rag_qa(question: str) -> str:
        """通过 RAG 检索增强回答商品相关问题"""
        return await rag.query(question)

    return [
        search_products,
        get_product_detail,
        add_to_cart,
        view_cart,
        create_order,
        pay_order,
        track_order,
        get_recommendations,
        compare_products,
        get_categories,
        rag_qa,
    ]


# ============ Workflow 层 ============
class WorkflowLayer:
    """Workflow 层 - 处理 Token 预算、上下文压缩、意图识别"""
    
    def __init__(self):
        self.max_tokens = MAX_CONTEXT_TOKENS
    
    async def process(self, state: EcommerceAgentState) -> Dict:
        """Workflow 预处理"""
        messages = state.get("messages", [])
        user_message = state.get("user_message", "")
        
        # 1. 意图识别
        intent = self._detect_intent(user_message)
        
        # 2. Token 预算控制 - 裁剪历史消息
        trimmed_messages = trim_messages(
            messages,
            max_tokens=self.max_tokens,
            strategy="last",
            token_counter=self._count_tokens,
        )
        
        # 3. 上下文压缩 - 提取关键信息
        context = self._extract_context(trimmed_messages)
        
        return {
            "messages": trimmed_messages,
            "intent": intent,
            "context": context,
            "token_count": self._count_tokens(trimmed_messages),
        }
    
    def _detect_intent(self, message: str) -> str:
        """简单意图识别"""
        message = message.lower()
        
        intents = {
            "search": ["找", "搜索", "有没有", "推荐", "查询", "怎么", "哪里", "什么"],
            "cart": ["购物车", "添加", "加入", "购买", "下单"],
            "order": ["订单", "我的订单", "订单号", "物流", "状态"],
            "pay": ["支付", "付款", "结账", "买单"],
            "compare": ["对比", "比较", "vs", "哪个好", "区别"],
            "detail": ["详情", "详细", "信息", "介绍"],
            "category": ["分类", "类别", "类型"],
        }
        
        for intent, keywords in intents.items():
            if any(kw in message for kw in keywords):
                return intent
        
        return "general"
    
    def _extract_context(self, messages: list) -> str:
        """从消息历史中提取关键上下文"""
        context_parts = []
        for msg in messages[-5:]:  # 最近5条
            if isinstance(msg, HumanMessage):
                context_parts.append(f"用户: {msg.content}")
            elif isinstance(msg, AIMessage) and msg.content:
                context_parts.append(f"助手: {msg.content[:100]}...")
        return "\n".join(context_parts)
    
    def _count_tokens(self, messages: list) -> int:
        """粗略估算 token 数（中文约1.5字符/token，英文约4字符/token）"""
        total_chars = sum(len(str(msg.content)) for msg in messages if hasattr(msg, 'content'))
        return total_chars // 2  # 粗略估算


# ============ 电商 LangGraph Agent ============
class EcommerceAgent:
    """基于 LangGraph 的电商智能助手 Agent"""

    def __init__(self, rag: LangChainRAG, session_id: Optional[str] = None):
        self.rag = rag
        self.session_id = session_id or "default"
        self.workflow = WorkflowLayer()
        # 自动给 Go 请求附加 JWT（Go 服务已启用认证）
        self.http_client = httpx.AsyncClient(timeout=10.0, auth=GoJWTAuth())
        self.tools = create_ecommerce_tools(rag, self.http_client)
        self.llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.LLM_API_KEY or settings.ZHIPU_API_KEY,
            base_url=settings.LLM_API_URL,
            temperature=settings.LLM_TEMPERATURE,
        )
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self.checkpointer = self._create_checkpointer()
        self.graph = self._build_graph()

    def _create_checkpointer(self):
        """创建检查点（使用内存检查点，生产环境可换为 AsyncSqliteSaver）"""
        from langgraph.checkpoint.memory import MemorySaver
        return MemorySaver()

    def _build_graph(self) -> StateGraph:
        """构建 LangGraph 图"""
        workflow = StateGraph(EcommerceAgentState)

        # 添加节点
        workflow.add_node("workflow", self._workflow_node)
        workflow.add_node("retrieve_context", self._retrieve_context_node)
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", ToolNode(self.tools))

        # 设置入口
        workflow.set_entry_point("workflow")

        # 添加边
        workflow.add_edge("workflow", "retrieve_context")
        workflow.add_edge("retrieve_context", "agent")
        workflow.add_conditional_edges(
            "agent",
            self._should_continue,
            {
                "continue": "tools",
                "end": END,
            },
        )
        workflow.add_edge("tools", "agent")

        # 编译图（不持久化状态，使用内存模式）
        return workflow.compile()

    async def _workflow_node(self, state: EcommerceAgentState) -> Dict:
        """Workflow 层节点 - 预处理"""
        result = await self.workflow.process(state)
        return result

    async def _retrieve_context_node(self, state: EcommerceAgentState) -> Dict:
        """检索上下文节点"""
        user_message = state.get("user_message", "")
        if not user_message:
            return {"context": ""}

        try:
            results = await self.rag.search(user_message, top_k=3)
            if results:
                context = "\n".join([f"[{r['entity_type']}] {r['content']}" for r in results])
                return {"context": context}
        except Exception:
            pass
        return {"context": ""}

    async def _agent_node(self, state: EcommerceAgentState) -> Dict:
        """Agent 决策节点"""
        messages = state["messages"]
        context = state.get("context", "")
        intent = state.get("intent", "general")

        # 构建系统提示
        system_prompt = f"""你是星选商城的智能购物助手。你可以帮助用户：
1. 搜索和发现商品
2. 查看商品详情
3. 管理购物车
4. 提交订单和支付
5. 查询订单状态
6. 获取个性化推荐
7. 对比商品信息

当前用户意图: {intent}
当前检索到的相关上下文:
{context if context else "无"}

请根据用户问题选择合适的工具，给出简洁准确的回答。
当用户要下单时，务必确认收货地址和商品信息。"""

        # 构建消息列表
        all_messages = [SystemMessage(content=system_prompt)] + messages

        # 调用 LLM
        response = await self.llm_with_tools.ainvoke(all_messages)

        return {"messages": [response]}

    def _should_continue(self, state: EcommerceAgentState) -> str:
        """判断是否继续调用工具"""
        messages = state["messages"]
        last_message = messages[-1]

        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            return "continue"
        return "end"

    async def run(self, user_message: str, user_id: Optional[str] = None) -> str:
        """运行 Agent"""
        config = {"configurable": {"thread_id": self.session_id}}

        initial_state = {
            "messages": [HumanMessage(content=user_message)],
            "user_message": user_message,
            "user_id": user_id,
            "context": "",
            "tool_results": [],
            "token_count": 0,
            "intent": None,
        }

        result = await self.graph.ainvoke(initial_state, config=config)

        # 获取最后一条 AI 消息
        final_messages = result.get("messages", [])
        for msg in reversed(final_messages):
            if isinstance(msg, AIMessage) and msg.content:
                return msg.content

        return "抱歉，我无法回答这个问题。"

    async def stream(self, user_message: str, user_id: Optional[str] = None):
        """流式运行 Agent"""
        config = {"configurable": {"thread_id": self.session_id}}

        initial_state = {
            "messages": [HumanMessage(content=user_message)],
            "user_message": user_message,
            "user_id": user_id,
            "context": "",
            "tool_results": [],
            "token_count": 0,
            "intent": None,
        }

        async for chunk in self.graph.astream(initial_state, config=config):
            yield chunk


# ============ 工厂函数 ============
def create_ecommerce_agent(rag: LangChainRAG, session_id: Optional[str] = None) -> EcommerceAgent:
    """创建电商 Agent 实例"""
    return EcommerceAgent(rag, session_id)
