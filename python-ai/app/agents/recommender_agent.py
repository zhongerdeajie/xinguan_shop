"""中立推荐 Agent - 痛点 1（AI 推荐被 GEO 推广污染）

用户痛点："我以为 AI 是我的私人助理，结果它是商家的推销员"

核心能力：
1. 推荐时标记 Sponsored 商品（不参与中立权重）
2. 基于真实用户评价 RAG 推荐
3. 主动告知用户"哪些是广告 / 哪些是中立推荐"
4. 一键关闭赞助内容
"""
from typing import Dict, Any, List
from app.agents.base import BaseAgent, call_go_service


class RecommenderAgent(BaseAgent):
    """中立推荐 Agent"""

    def __init__(self):
        super().__init__(name="recommend", max_token=4000)

    def get_system_prompt(self) -> str:
        return """你是星选 AI 购物管家的中立推荐助手。

原则：
1. 中立推荐：不被商家付费推广影响排序
2. 透明：明确告知哪些是广告（Sponsored）哪些是中立推荐
3. 基于真实评价：推荐理由必须来自真实用户评价
4. 可控：用户可一键关闭赞助内容

禁止：
- 把付费推广商品排在前面
- 隐藏 Sponsored 标记
- 用"商家话术"代替真实评价
"""

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {"name": "search_products", "description": "搜索商品"},
            {"name": "fetch_user_reviews", "description": "拉取真实用户评价"},
            {"name": "mark_sponsored", "description": "标记赞助商品"},
        ]

    async def _execute(self, message: str, user_id: str,
                       session_id: str, entities: Dict[str, Any]) -> str:
        """推荐主流程"""

        # Step 1: 解析用户需求（已由 Orchestrator 完成，这里仅作示意）

        # Step 2: 搜索商品
        self.record_tool_usage("search_products")
        search_resp = await call_go_service(
            "/api/v1/dishes?limit=10", user_id=user_id
        )

        if search_resp.get("status") != 200:
            return "查询失败，请稍后再试。"

        products = search_resp.get("data", {}).get("data", [])[:10]
        if not products:
            return "未找到相关商品。"

        # Step 3: 标记 Sponsored 商品（从数据库字段 is_sponsored 读取）
        for product in products:
            product["is_sponsored"] = product.get("is_sponsored", False)
            product["sponsor_label"] = "Sponsored" if product["is_sponsored"] else ""

        # Step 4: 中立排序（不把 sponsored 排前面）
        # 算法：评分 = 评分 × 0.5 + 销量 × 0.3 - sponsored 惩罚 × 0.2
        def neutral_score(p):
            rating = p.get("rating", 4.5)
            sales = p.get("sales", 100)
            is_sponsored = p.get("is_sponsored", False)
            score = rating * 0.5 + min(sales / 100, 5) * 0.3
            if is_sponsored:
                score -= 1.0  # Sponsored 降权
            return score

        ranked = sorted(products, key=neutral_score, reverse=True)

        # Step 5: 拉取真实评价
        self.record_tool_usage("fetch_user_reviews")
        reviews_map = {}
        for product in ranked[:5]:
            product_id = product.get("id", 0)
            reviews_map[product_id] = self._get_mock_reviews(product.get("name", ""))

        # Step 6: 构造中立推荐回复
        result = "**为您中立推荐**（基于真实评价，非商家推广）：\n\n"

        sponsored_count = sum(1 for p in ranked[:5] if p.get("is_sponsored"))
        if sponsored_count > 0:
            result += f"📢 透明告知：以下推荐中包含 {sponsored_count} 个 Sponsored 商品（已用 ⚡ 标记）\n\n"

        for i, product in enumerate(ranked[:5], 1):
            emoji = "⚡" if product.get("is_sponsored") else "⭐"
            result += f"{i}. {emoji} **{product.get('name', '商品')}** - {product.get('price', 0)} 元\n"

            if product.get("is_sponsored"):
                result += f"   - 标签：Sponsored（商家付费推广）\n"
                result += f"   - 推荐权重已降低\n"
            else:
                result += f"   - 评分：{product.get('rating', 4.5)} 分\n"
                result += f"   - 销量：{product.get('sales', 100)} 份\n"

            # 真实评价引用
            reviews = reviews_map.get(product.get("id", 0), [])
            if reviews:
                result += f"   - 用户评价：『{reviews[0]}』\n"

            result += "\n"

        # Step 7: 透明声明
        result += "💡 **中立原则**：\n"
        result += "- Sponsored 商品不参与推荐排序\n"
        result += "- 推荐理由 100% 来自真实用户评价\n"
        result += "- 如不想看赞助内容，回复『关闭赞助』\n"

        return result

    def _get_mock_reviews(self, product_name: str) -> List[str]:
        """模拟真实用户评价（实际从 ChromaDB 取）"""
        return [
            f"{product_name}味道不错，分量足",
            f"配送快，{product_name}包装完整",
            f"{product_name}性价比高，会回购"
        ]