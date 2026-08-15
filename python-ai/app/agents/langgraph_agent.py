"""LangGraph Agent - 星选 AI 购物管家（电商场景）基于图编排的多轮对话 Agent"""
from typing import List, Dict, Any, Optional, Annotated
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.sqlite import SqliteSaver
from typing_extensions import TypedDict
import os

from app.config import settings
from app.core.langchain_rag import LangChainRAG
from app.core.simple_vector import SimpleVectorStore


# ============ 状态定义 ============
class AgentState(TypedDict):
    """Agent 状态"""
    messages: Annotated[list, add_messages]
    user_message: str
    context: str
    tool_results: list


# ============ 工具定义 ============
def create_tools(rag: LangChainRAG):
    """创建电商场景 Agent 工具集

    实体类型与 real_rag_documents.json 对齐：
    - 菜品/饮品/水果: dish_*, drink_*, fruit_*
    - 促销与价格: price_compare, fake_discount, coupon_complex, marketing_blackbox
    - 售后规则: aftersales
    - 商家运营: merchant_*, industry_*
    """

    def _format(results) -> str:
        if not results:
            return ""
        return "\n".join([f"[{r['entity_type']}] {r['content']} (相似度: {r['score']:.3f})" for r in results])

    @tool
    async def search_dishes(query: str) -> str:
        """搜索菜品、饮品、水果的知识（口味、评价、价格区间等）。参数: query 为菜名/品类/关键词，如「辣椒炒肉」「川菜」"""
        results = await rag.search(query, top_k=5)
        filtered = [r for r in results if r["entity_type"].startswith(("dish_", "drink_", "fruit_"))]
        if not filtered:
            return "没有找到相关菜品信息"
        return _format(filtered)

    @tool
    async def search_promotions(query: str) -> str:
        """搜索促销、优惠券、真假折扣相关的知识。参数: query 为关键词，如「满减」「优惠券」「假打折」"""
        results = await rag.search(query, top_k=5)
        filtered = [r for r in results if r["entity_type"] in (
            "price_compare", "fake_discount", "coupon_complex", "marketing_blackbox",
        )]
        if not filtered:
            return "没有找到相关促销信息"
        return _format(filtered)

    @tool
    async def search_after_sales(query: str) -> str:
        """搜索售后规则（退款、少送漏发、换货、投诉处理）。参数: query 为关键词"""
        results = await rag.search(query, top_k=5)
        filtered = [r for r in results if r["entity_type"] == "aftersales"]
        if not filtered:
            return "没有找到相关售后信息"
        return _format(filtered)

    @tool
    async def search_merchant_tips(query: str) -> str:
        """搜索商家运营知识（活动策划、用户分群、推品、各行业案例）。参数: query 为关键词"""
        results = await rag.search(query, top_k=5)
        filtered = [r for r in results if r["entity_type"].startswith(("merchant_", "industry_"))]
        if not filtered:
            return "没有找到相关商家运营信息"
        return _format(filtered)

    @tool
    async def search_all(query: str) -> str:
        """全局搜索 - 同时搜索菜品、促销、售后、商家运营等全部知识。参数: query 为关键词"""
        results = await rag.search(query, top_k=10)
        if not results:
            return "没有找到相关信息"
        return _format(results)

    @tool
    async def rag_qa(question: str) -> str:
        """通过 RAG 检索增强直接回答问题。参数: question 为问题"""
        return await rag.query(question)

    return [search_dishes, search_promotions, search_after_sales, search_merchant_tips, search_all, rag_qa]


# ============ LangGraph Agent ============
class LangGraphAgent:
    """基于 LangGraph 的图编排 Agent"""

    def __init__(self, rag: LangChainRAG, session_id: Optional[str] = None):
        self.rag = rag
        self.session_id = session_id or "default"
        self.tools = create_tools(rag)
        self.llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.LLM_API_KEY or settings.ZHIPU_API_KEY,
            base_url=settings.LLM_API_URL,
            temperature=settings.LLM_TEMPERATURE,
        )
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self.checkpointer = self._create_checkpointer()
        self.graph = self._build_graph()

    def _create_checkpointer(self) -> SqliteSaver:
        """创建 SQLite 持久化检查点"""
        db_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "checkpoints")
        os.makedirs(db_path, exist_ok=True)
        db_file = os.path.join(db_path, "langgraph.db")
        return SqliteSaver.from_conn_string(db_file)

    def _build_graph(self) -> StateGraph:
        """构建 LangGraph 图"""
        workflow = StateGraph(AgentState)

        # 添加节点
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", ToolNode(self.tools))
        workflow.add_node("retrieve_context", self._retrieve_context_node)

        # 设置入口
        workflow.set_entry_point("retrieve_context")

        # 添加边
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

        # 编译图
        return workflow.compile(checkpointer=self.checkpointer)

    async def _retrieve_context_node(self, state: AgentState) -> Dict:
        """检索上下文节点 - 在 Agent 决策前获取相关上下文"""
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

    async def _agent_node(self, state: AgentState) -> Dict:
        """Agent 决策节点"""
        messages = state["messages"]
        context = state.get("context", "")

        # 构建系统提示
        system_prompt = f"""你是「星选 AI 购物管家」的 AI 助手（LangGraph 版）。你可以：
1. 搜索菜品/饮品知识（口味、评价、价格区间、做法）
2. 搜索促销、优惠券、真假折扣知识
3. 搜索售后规则（退款、少送漏发、换货）
4. 搜索商家运营知识（活动策划、用户分群、推品）
5. 通过 RAG 检索直接回答问题

要求：
- 先根据用户问题选择合适的工具获取真实信息，不要凭空编造
- 引用检索结果时说明依据；检索不到就直说"没有找到相关信息"
- 涉及价格、折扣、退款规则时以检索到的内容为准
- 用户表达购物意图（点菜/凑单/比价/退款）时，提示可以在前端确认后完成真实操作

当前检索到的相关上下文:
{context if context else "无"}"""

        # 构建消息列表
        all_messages = [SystemMessage(content=system_prompt)] + messages

        # 调用 LLM
        response = await self.llm_with_tools.ainvoke(all_messages)

        return {"messages": [response]}

    def _should_continue(self, state: AgentState) -> str:
        """判断是否继续调用工具"""
        messages = state["messages"]
        last_message = messages[-1]

        if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
            return "continue"
        return "end"

    async def run(self, user_message: str) -> str:
        """运行 Agent"""
        config = {"configurable": {"thread_id": self.session_id}}

        initial_state = {
            "messages": [HumanMessage(content=user_message)],
            "user_message": user_message,
            "context": "",
            "tool_results": [],
        }

        result = await self.graph.ainvoke(initial_state, config=config)

        # 获取最后一条 AI 消息
        final_messages = result.get("messages", [])
        for msg in reversed(final_messages):
            if isinstance(msg, AIMessage) and msg.content:
                return msg.content

        return "抱歉，我无法回答这个问题。"

    async def stream(self, user_message: str):
        """流式运行 Agent"""
        config = {"configurable": {"thread_id": self.session_id}}

        initial_state = {
            "messages": [HumanMessage(content=user_message)],
            "user_message": user_message,
            "context": "",
            "tool_results": [],
        }

        async for chunk in self.graph.astream(initial_state, config=config):
            yield chunk


# ============ 工厂函数 ============
def create_langgraph_agent(rag: LangChainRAG, session_id: Optional[str] = None) -> LangGraphAgent:
    """创建 LangGraph Agent 实例"""
    return LangGraphAgent(rag, session_id)
