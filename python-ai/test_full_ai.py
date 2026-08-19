# -*- coding: utf-8 -*-
"""
全面 AI 链路测试
覆盖:闲聊/下单/指代/记忆/边界/混合意图/异常输入
"""
import asyncio
import json
import sys
import traceback

# Windows 控制台 UTF-8 输出,避免 emoji 崩
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, ".")

from app.agents.orchestrator import get_orchestrator

PASS = 0
FAIL = 0
RESULTS = []


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        status = "PASS"
    else:
        FAIL += 1
        status = "FAIL"
    RESULTS.append(f"[{status}] {name} {detail}")
    print(f"[{status}] {name} {detail}")


async def test():
    orch = get_orchestrator()

    # ========== 1. 闲聊场景 ==========
    print("\n===== 1. 闲聊场景 =====")
    for msg in ["你好", "你是谁", "谢谢", "再见", "?", "？？", "什么玩意", "在吗", "嗨"]:
        try:
            r = await orch.route(message=msg, session_id="t-chat")
            check(f"闲聊[{msg}]", r.get("intent") == "chitchat",
                  f"intent={r.get('intent')} agent={r.get('agent')} resp={(str(r.get('response'))[:40]).replace(chr(10),' ')}")
        except Exception as e:
            check(f"闲聊[{msg}]", False, f"EXC:{type(e).__name__}:{e}")

    # ========== 2. 下单场景 ==========
    print("\n===== 2. 下单场景 =====")
    sid_order = "t-order"
    for msg in ["我要一份拍黄瓜", "我想吃辣椒炒肉", "来两个酸梅汤", "下单一份米饭"]:
        try:
            r = await orch.route(message=msg, session_id=sid_order)
            check(f"下单[{msg}]", r.get("intent") == "nl_order",
                  f"intent={r.get('intent')} resp={(str(r.get('response'))[:40]).replace(chr(10),' ')}")
        except Exception as e:
            check(f"下单[{msg}]", False, f"EXC:{type(e).__name__}:{e}")

    # ========== 3. 推荐/凑单/比价/售后/营销 ==========
    print("\n===== 3. 业务意图 =====")
    biz_cases = [
        ("推荐几个菜", "recommend"),
        ("有什么好吃的", "recommend"),
        ("预算50元帮我凑单", "smart_bargain"),
        ("满减怎么凑", "smart_bargain"),
        ("辣椒炒肉贵不贵", "price_compare"),
        ("我要退款", "aftersales"),
        ("少送了一个菜", "aftersales"),
        ("搞个满减活动", "marketing"),
    ]
    for msg, expect in biz_cases:
        try:
            r = await orch.route(message=msg, session_id="t-biz")
            check(f"业务[{msg}]=>{expect}", r.get("intent") == expect,
                  f"got={r.get('intent')}")
        except Exception as e:
            check(f"业务[{msg}]", False, f"EXC:{type(e).__name__}:{e}")

    # ========== 4. 边界/异常输入 ==========
    print("\n===== 4. 边界/异常输入 =====")
    edge_cases = ["", " ", "a", "1", "！！！", "🤣", "abcdefghijk", "x" * 500]
    for msg in edge_cases:
        try:
            r = await orch.route(message=msg, session_id="t-edge")
            # 边界输入不应抛异常,应给出友好回复
            check(f"边界[{msg!r}]", bool(r.get("response")),
                  f"intent={r.get('intent')}")
        except Exception as e:
            check(f"边界[{msg!r}]", False, f"EXC:{type(e).__name__}:{e}")

    # ========== 5. 多轮记忆(核心!) ==========
    print("\n===== 5. 多轮记忆 =====")
    sid = "t-memory-1"
    # 第1轮:推荐
    r1 = await orch.route(message="推荐几个菜", session_id=sid)
    check("记忆R1推荐", r1.get("intent") in ("recommend", "nl_order", "chitchat"),
          f"intent={r1.get('intent')}")
    # 第2轮:确认(应能关联上文,或至少不智障)
    r2 = await orch.route(message="第一个", session_id=sid)
    check("记忆R2第一个", r2.get("intent") != "out_of_scope",
          f"intent={r2.get('intent')} resp={(str(r2.get('response'))[:60]).replace(chr(10),' ')}")

    # 第3轮:新会话(记忆不应跨 session)
    r3 = await orch.route(message="推荐几个菜", session_id="t-memory-2")
    check("记忆R3新会话", r3.get("intent") in ("recommend", "nl_order", "chitchat"),
          f"intent={r3.get('intent')}")

    # ========== 6. 指代消解 ==========
    print("\n===== 6. 指代消解 =====")
    sid2 = "t-ref"
    await orch.route(message="推荐几个菜", session_id=sid2)
    for msg in ["选第一个", "就第一个吧", "它叫什么", "再加一份"]:
        try:
            r = await orch.route(message=msg, session_id=sid2)
            check(f"指代[{msg}]", r.get("intent") != "out_of_scope",
                  f"intent={r.get('intent')} resp={(str(r.get('response'))[:50]).replace(chr(10),' ')}")
        except Exception as e:
            check(f"指代[{msg}]", False, f"EXC:{type(e).__name__}:{e}")

    # ========== 7. 结构完整性 ==========
    print("\n===== 7. 返回结构完整性 =====")
    try:
        r = await orch.route(message="你好", session_id="t-struct")
        for key in ["intent", "agent", "response", "entities", "tools_used", "order_suggestion", "error"]:
            check(f"结构[{key}]", key in r, f"r.keys()={list(r.keys())}")
    except Exception as e:
        check("结构完整", False, f"EXC:{type(e).__name__}:{e}")

    # ========== 汇总 ==========
    print(f"\n===== 汇总: PASS={PASS} FAIL={FAIL} =====")
    with open("test_full_result.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(RESULTS))
        f.write(f"\n\n===== 汇总: PASS={PASS} FAIL={FAIL} =====\n")
    return PASS, FAIL


if __name__ == "__main__":
    try:
        p, f = asyncio.run(test())
        sys.exit(1 if f else 0)
    except Exception:
        traceback.print_exc()
        sys.exit(2)
