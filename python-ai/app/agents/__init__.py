"""Agents package - 6 个专项 Agent + Orchestrator"""
from app.agents.orchestrator import (
    Orchestrator,
    get_orchestrator,
    classify_intent,
    extract_entities,
    AGENT_REGISTRY
)
from app.agents.base import BaseAgent
from app.agents.nl_order_agent import NLOrderAgent
from app.agents.smart_bargain_agent import SmartBargainAgent
from app.agents.price_compare_agent import PriceCompareAgent
from app.agents.aftersales_agent import AftersalesAgent
from app.agents.marketing_agent import MarketingAgent
from app.agents.recommender_agent import RecommenderAgent

__all__ = [
    "Orchestrator",
    "get_orchestrator",
    "classify_intent",
    "extract_entities",
    "AGENT_REGISTRY",
    "BaseAgent",
    "NLOrderAgent",
    "SmartBargainAgent",
    "PriceCompareAgent",
    "AftersalesAgent",
    "MarketingAgent",
    "RecommenderAgent"
]