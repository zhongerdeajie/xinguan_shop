"""排课系统 AI Agent - LangChain Function Call"""
from typing import List, Dict, Any
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.config import settings
from app.core.langchain_rag import LangChainRAG
from app.core.simple_vector import SimpleVectorStore


def create_schedule_agent(rag: LangChainRAG):
    """创建排课系统 AI Agent"""

    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        api_key=settings.LLM_API_KEY or settings.ZHIPU_API_KEY,
        base_url=settings.LLM_API_URL,
        temperature=0.3,
    )

    @tool
    async def search_teachers(query: str) -> str:
        """搜索教师信息。参数: query 为教师姓名或关键词"""
        results = await rag.search(query, top_k=5, entity_type="teacher")
        if not results:
            return "没有找到相关教师"
        return "\n".join([f"{r['content']} (相似度: {r['score']:.3f})" for r in results])

    @tool
    async def search_courses(query: str) -> str:
        """搜索课程信息。参数: query 为课程名称或关键词"""
        results = await rag.search(query, top_k=5, entity_type="course")
        if not results:
            return "没有找到相关课程"
        return "\n".join([f"{r['content']} (相似度: {r['score']:.3f})" for r in results])

    @tool
    async def search_classrooms(query: str) -> str:
        """搜索教室信息。参数: query 为教室名称或关键词"""
        results = await rag.search(query, top_k=5, entity_type="classroom")
        if not results:
            return "没有找到相关教室"
        return "\n".join([f"{r['content']} (相似度: {r['score']:.3f})" for r in results])

    @tool
    async def rag_qa(question: str) -> str:
        """通过 RAG 检索增强回答问题。参数: question 为问题"""
        return await rag.query(question)

    tools = [search_teachers, search_courses, search_classrooms, rag_qa]
    llm_with_tools = llm.bind_tools(tools)

    system_prompt = """你是高校教务系统的AI助手。你可以：
1. 搜索教师、课程、教室信息
2. 通过 RAG 检索回答问题
3. 回答关于排课、选课、成绩管理的问题

请根据用户问题选择合适的工具，给出简洁准确的回答。"""

    async def run(user_message: str) -> str:
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message)
        ]
        response = llm_with_tools.invoke(messages)
        if response.tool_calls:
            results = []
            for call in response.tool_calls:
                tool_fn = next(t for t in tools if t.name == call["name"])
                result = await tool_fn.ainvoke(call["args"])
                results.append(f"[{call['name']}] {result}")
            return "\n\n".join(results)
        return response.content

    return run
