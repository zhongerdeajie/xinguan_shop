# -*- coding: utf-8 -*-
"""本地测试意图分类器"""
import asyncio
import sys

sys.path.insert(0, ".")

from app.core.intent_classifier import get_intent_classifier, rule_fast_path
from app.agents.orchestrator import classify_intent


async def test():
    c = get_intent_classifier()
    cases = [
        "你好",
        "你是谁",
        "我想吃辣椒炒肉",
        "推荐几个菜",
        "我要退款",
        "预算50凑单",
        "谢谢",
        "?",
        "什么玩意",
    ]
    for msg in cases:
        r = rule_fast_path(msg)
        r2 = classify_intent(msg)
        result = await c.classify(msg)
        print(
            f"{msg!r:20} rule={str(r):15} legacy={r2:12} "
            f"industrial={result['intent']} ({result['method']})"
        )


if __name__ == "__main__":
    asyncio.run(test())
