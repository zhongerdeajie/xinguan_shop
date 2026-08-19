# -*- coding: utf-8 -*-
"""本地测试 orchestrator 完整路由链路"""
import asyncio
import sys

sys.path.insert(0, ".")

from app.agents.orchestrator import get_orchestrator


async def test():
    orch = get_orchestrator()
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
    lines = []
    for msg in cases:
        r = await orch.route(message=msg, session_id="local-test")
        lines.append(
            f"{msg!r:20} intent={r.get('intent'):14} "
            f"agent={r.get('agent'):12} resp={(str(r.get('response'))[:70]).replace(chr(10), ' ')}"
        )
    with open("test_route_out.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("done")


if __name__ == "__main__":
    asyncio.run(test())
