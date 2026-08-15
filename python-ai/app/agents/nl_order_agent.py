"""自然语言下单 Agent - 痛点 3（关键词污染）+ 痛点 5（凑单烧脑）

用户输入示例：
- "明天晚上 6 点要 4 个人的晚餐，预算 200，要 2 个荤 1 个素 1 个汤"
- "帮我点 3 个菜，预算 80，要辣的"
- "今晚我和女朋友两人吃，预算 150"

核心能力：
1. 多步推理解析意图（人数、预算、时间、品类、口味）
2. 多次工具调用查询菜品
3. 多条件过滤（用户偏好、库存、价格）
4. 推荐 2-3 个组合方案
5. 询问用户确认
6. 调用 Go 服务下单
"""
from typing import Dict, Any, List
from app.agents.base import BaseAgent, call_go_service


class NLOrderAgent(BaseAgent):
    """自然语言下单 Agent"""

    def __init__(self):
        super().__init__(name="nl_order", max_token=8000)

    def get_system_prompt(self) -> str:
        return """你是星选 AI 购物管家的自然语言下单助手。

你的职责：
1. 严格解析用户需求（人数、预算、时间、菜品结构、口味偏好）
2. 多次调用工具查询真实菜品数据（不要靠猜）
3. 基于用户历史偏好过滤（不喜欢的不要）
4. 推荐 2-3 个最优组合方案，列出价格和明细
5. 询问用户确认后再下单

约束：
- 单次工具调用不要超过 5 次
- 必须基于真实菜品，不要凭空捏造
- 价格超出预算要主动告知
- 库存不足要主动告知
- 关键操作（如下单）必须用户确认

输出格式：
- 第一步：解析用户意图（实体提取）
- 第二步：调用工具
- 第三步：组合方案
- 第四步：询问用户
"""

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {"name": "search_dishes", "description": "按品类/价格/口味搜索菜品"},
            {"name": "get_user_preferences", "description": "获取用户历史偏好"},
            {"name": "check_inventory", "description": "检查菜品库存"},
            {"name": "add_to_cart", "description": "加入购物车"},
            {"name": "create_order", "description": "创建订单（需确认）"},
        ]

    async def _execute(self, message: str, user_id: str,
                       session_id: str, entities: Dict[str, Any]) -> str:
        """多步推理主流程"""

        # Step 1: 解析用户意图
        people_count = entities.get("people_count", 1)
        budget = entities.get("budget", 100)
        target_hour = entities.get("time", 18)
        meat_count = entities.get("meat", 1)
        veg_count = entities.get("veg", 1)
        soup_count = entities.get("soup", 0)

        analysis = (
            f"我理解您的需求：\n"
            f"- 人数：{people_count} 人\n"
            f"- 预算：{budget} 元\n"
            f"- 时间：{target_hour} 点\n"
            f"- 菜品结构：{meat_count} 荤 + {veg_count} 素 + {soup_count} 汤\n\n"
        )

        # Step 2: 查询候选菜品
        candidates = {"荤菜": [], "素菜": [], "汤品": []}

        if meat_count > 0:
            r = await call_go_service(
                f"/api/v1/dishes?categoryType=1&maxPrice={budget // (meat_count + veg_count + soup_count + 1) * 2}&limit=8",
                user_id=user_id
            )
            if r.get("status") == 200:
                candidates["荤菜"] = r["data"].get("data", [])[:5]
                self.record_tool_usage("search_dishes")

        if veg_count > 0:
            r = await call_go_service(
                f"/api/v1/dishes?categoryType=2&maxPrice={budget // 4}&limit=8",
                user_id=user_id
            )
            if r.get("status") == 200:
                candidates["素菜"] = r["data"].get("data", [])[:5]
                self.record_tool_usage("search_dishes")

        if soup_count > 0:
            r = await call_go_service(
                f"/api/v1/dishes?categoryType=3&maxPrice={budget // 4}&limit=8",
                user_id=user_id
            )
            if r.get("status") == 200:
                candidates["汤品"] = r["data"].get("data", [])[:3]
                self.record_tool_usage("search_dishes")

        # Step 3: 组合方案
        combinations = self._build_combinations(candidates, meat_count, veg_count, soup_count, budget)

        if not combinations:
            return analysis + f"抱歉，没找到符合条件的菜品。建议您：\n1. 提高预算到 {int(budget * 1.3)} 元\n2. 放宽菜品品类要求"

        # Step 4: 展示方案
        result = analysis + "我为您组合了以下方案：\n\n"
        for i, combo in enumerate(combinations[:3], 1):
            result += f"**方案 {i}**（共 {combo['total']} 元）：\n"
            for dish in combo["items"]:
                result += f"- {dish['name']} - {dish['price']} 元\n"
            result += "\n"

        # Step 5: 检查是否需要凑单（总价 < 预算 80%）
        best = combinations[0]
        if best["total"] < budget * 0.7:
            result += f"💡 提示：您预算还有 {budget - best['total']} 元剩余，可以加点小菜更划算。\n\n"

        result += "请告诉我您选哪个方案，或需要我调整。"

        return result

    def _build_combinations(self, candidates: Dict[str, List],
                           meat_count: int, veg_count: int,
                           soup_count: int, budget: int) -> List[Dict[str, Any]]:
        """构建菜品组合方案"""
        meat_list = candidates.get("荤菜", [])
        veg_list = candidates.get("素菜", [])
        soup_list = candidates.get("汤品", [])

        if not meat_list or len(meat_list) < meat_count:
            return []
        if veg_count > 0 and (not veg_list or len(veg_list) < veg_count):
            return []
        if soup_count > 0 and (not soup_list or len(soup_list) < soup_count):
            return []

        combinations = []

        # 简单组合：取每个品类的第 1 / 2 / 3 个
        for offset in range(3):
            items = []
            total = 0

            # 荤菜
            for i in range(meat_count):
                idx = (offset + i) % len(meat_list)
                dish = meat_list[idx]
                items.append(dish)
                total += dish.get("price", 0)

            # 素菜
            for i in range(veg_count):
                idx = (offset + i) % len(veg_list)
                dish = veg_list[idx]
                items.append(dish)
                total += dish.get("price", 0)

            # 汤品
            for i in range(soup_count):
                idx = (offset + i) % len(soup_list)
                dish = soup_list[idx]
                items.append(dish)
                total += dish.get("price", 0)

            if total <= budget:
                combinations.append({"items": items, "total": total})

        # 按总价排序
        combinations.sort(key=lambda x: -x["total"])  # 价格高的优先（更接近预算）
        return combinations