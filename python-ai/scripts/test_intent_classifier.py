"""工业级意图识别实测脚本

用法（容器内）：cd /app && python scripts/test_intent_classifier.py
"""
import asyncio
from collections import Counter

from app.core.intent_classifier import get_intent_classifier


TEST_CASES = [
    # (输入, 期望意图)
    ("帮我点两个菜，预算 50", "nl_order"),
    ("今晚三个人吃饭，要两个荤一个素，预算一百", "nl_order"),
    ("来一份辣椒炒肉和两碗米饭", "nl_order"),
    ("明天中午 4 个人，预算 150，帮忙安排", "nl_order"),
    ("怎么凑单最划算，满100减20", "smart_bargain"),
    ("还差多少钱能用到这张券", "smart_bargain"),
    ("帮我凑到50块，多点便宜菜", "smart_bargain"),
    ("这个菜最近是涨价了还是降价了", "price_compare"),
    ("历史价格看看是不是假打折", "price_compare"),
    ("辣椒炒肉现在买贵不贵", "price_compare"),
    ("我要退款，菜少送了", "aftersales"),
    ("订单漏发了一瓶饮料，怎么办", "aftersales"),
    ("退款什么时候到账", "aftersales"),
    ("帮我写个母亲节活动文案", "marketing"),
    ("给老用户分群做个推送方案", "marketing"),
    ("有什么招牌菜推荐吗", "recommend"),
    ("不知道吃啥，帮我推荐", "recommend"),
    ("今天天气怎么样", "out_of_scope"),
    ("讲个笑话", "out_of_scope"),
    ("你会写代码吗", "out_of_scope"),
]


async def main() -> None:
    clf = get_intent_classifier()
    total = correct = 0
    methods: Counter = Counter()

    for text, expected in TEST_CASES:
        r = await clf.classify(text)
        ok = r["intent"] == expected
        total += 1
        correct += 1 if ok else 0
        methods[r["method"]] += 1
        mark = "✓" if ok else "✗"
        print(
            f"{mark} [{r['method']:>9}] exp={expected:<16} "
            f"got={r['intent']:<16} conf={r['confidence']:.3f} | {text}"
        )

    print("-" * 70)
    print(f"准确率: {correct}/{total} = {correct / total:.1%}")
    print(f"方法分布: {dict(methods)}")


if __name__ == "__main__":
    asyncio.run(main())
