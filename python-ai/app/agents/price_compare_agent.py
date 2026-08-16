"""智能比价 Agent - 痛点 5（跨平台比价 + 假打折）

核心能力：
1. 跨品类比价（同一个商品对比多个商家）
2. 历史价格曲线（Redis Sorted Set 存储 90 天）
3. 判断"真打折"vs"假打折"
4. 主动告知购买时机建议

数据结构：
key: price:history:{productId}
score: timestamp
value: price
"""
from typing import Dict, Any, List, Optional
import os
import time
from app.agents.base import BaseAgent


async def record_price(product_id: int, price: float) -> None:
    """记录商品价格到 Redis Sorted Set"""
    import aiohttp
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
    timestamp = int(time.time() * 1000)

    # 使用 Redis HTTP API
    try:
        async with aiohttp.ClientSession() as session:
            # ZADD price:history:{id} {timestamp} {price}
            url = f"http://redis:6379"  # placeholder
            # 实际生产中用 redis-py
            pass
    except Exception:
        pass


def get_price_history_local(product_id: int) -> List[Dict[str, Any]]:
    """从 Redis 获取历史价格（本地实现）"""
    import json
    history_file = f"/tmp/price_history_{product_id}.json"
    if os.path.exists(history_file):
        try:
            with open(history_file) as f:
                return json.load(f)
        except Exception:
            return []
    return []


def analyze_price_trend(prices: List[Dict[str, Any]], current: float) -> Dict[str, Any]:
    """分析价格趋势，判断真打折 / 假打折

    Args:
        prices: [{timestamp, price}, ...]
        current: 当前价格

    Returns:
        {
            "trend": "down" | "up" | "stable",
            "min": 历史最低价,
            "max": 历史最高价,
            "avg": 历史均价,
            "median": 历史中位数,
            "is_real_discount": True/False,
            "suggestion": "建议立即购买" / "建议观望" / "等待促销"
        }
    """
    if not prices:
        return {
            "trend": "unknown",
            "min": current,
            "max": current,
            "avg": current,
            "median": current,
            "is_real_discount": False,
            "suggestion": "暂无历史价格数据"
        }

    price_values = [p.get("price", 0) for p in prices]
    price_values.sort()

    n = len(price_values)
    min_price = price_values[0]
    max_price = price_values[-1]
    avg_price = sum(price_values) / n
    median_price = price_values[n // 2]

    # 判断趋势（最近 7 天 vs 之前 23 天）
    recent = price_values[-7:] if len(price_values) >= 7 else price_values
    earlier = price_values[:-7] if len(price_values) >= 14 else []

    if earlier:
        recent_avg = sum(recent) / len(recent)
        earlier_avg = sum(earlier) / len(earlier)
        if recent_avg < earlier_avg * 0.9:
            trend = "down"  # 降价趋势
        elif recent_avg > earlier_avg * 1.1:
            trend = "up"
        else:
            trend = "stable"
    else:
        trend = "stable"

    # 判断真打折：当前价 <= 历史均价的 90%
    is_real_discount = current <= avg_price * 0.9

    # 建议
    if is_real_discount and trend == "down":
        suggestion = "💰 真打折，建议立即购买"
    elif current <= min_price * 1.05:
        suggestion = "💎 当前价接近历史最低，建议购买"
    elif trend == "up":
        suggestion = "📈 价格正在上涨，建议尽快购买"
    elif current >= avg_price * 1.1:
        suggestion = "⚠️ 价格偏高，建议观望"
    else:
        suggestion = "价格稳定，可按需购买"

    return {
        "trend": trend,
        "min": round(min_price, 2),
        "max": round(max_price, 2),
        "avg": round(avg_price, 2),
        "median": round(median_price, 2),
        "is_real_discount": is_real_discount,
        "suggestion": suggestion
    }


class PriceCompareAgent(BaseAgent):
    """智能比价 Agent"""

    def __init__(self):
        super().__init__(name="price_compare", max_token=6000)

    def get_system_prompt(self) -> str:
        return """你是星选 AI 购物管家的智能比价助手。

职责：
1. 跨品类对比同款商品不同商家的价格
2. 拉取历史价格曲线（Redis Sorted Set 90 天）
3. 智能判断"真打折"vs"假打折"
4. 给出购买时机建议

判断标准：
- 真打折：当前价 <= 历史均价 90%
- 接近最低价：当前价 <= 历史最低 105%
- 价格偏高：当前价 >= 历史均价 110%

回复格式：
- 当前价格 + 历史价格曲线
- 真假打折判定
- 购买建议
"""

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {"name": "search_product_by_name", "description": "按名称搜索商品"},
            {"name": "get_price_history", "description": "拉取历史价格"},
            {"name": "compare_prices", "description": "跨商家比价"},
        ]

    async def _execute(self, message: str, user_id: str,
                       session_id: str, entities: Dict[str, Any],
                       history: Optional[List[Dict[str, str]]] = None) -> str:
        """比价主流程"""

        # Step 1: 从消息提取商品名称
        product_name = self._extract_product_name(message)
        if not product_name:
            return "请告诉我您想比价的商品名称，例如可乐、iPhone 15。"

        # Step 2: 搜索商品（P0-3：改用 NestJS）
        from app.agents.base import call_nestjs_api
        search_resp = await call_nestjs_api(
            f"/v1/dishes?keyword={product_name}&limit=10"
        )
        self.record_tool_usage("search_product_by_name")

        if search_resp.get("status") != 200:
            return f"查询 {product_name} 时出错了，请稍后再试。"

        products = search_resp.get("data", {}).get("data") or search_resp.get("data", {}).get("list") or []
        if not products:
            return (
                f"未找到 {product_name} 相关商品。\n\n"
                f"建议您：\n"
                f"1. 检查商品名称是否正确\n"
                f"2. 尝试更通用的关键词（如'可乐'、'手机'）\n"
                f"3. 浏览商品分类查找"
            )

        # Step 3: 对每个商品分析历史价格
        result = f"**{product_name} 比价结果**：\n\n"
        best_product = None
        best_score = -1

        for product in products[:5]:
            price = float(product.get("price", 0) or 0)
            name = product.get("name", "未知商品")

            # P1-2：从 Redis ZSET 读真实价格历史（不再造假）
            real_history = self._get_real_history(product.get("id", 0), price)

            result += f"**{name}** - {price} 元\n"
            if real_history:
                analysis = analyze_price_trend(real_history, price)
                result += f"  - 历史最低：{analysis['min']} 元\n"
                result += f"  - 历史均价：{analysis['avg']} 元\n"
                result += f"  - 趋势：{self._trend_emoji(analysis['trend'])} {analysis['trend']}\n"
                result += f"  - {analysis['suggestion']}\n\n"
                score = 100 - price + (10 if analysis['is_real_discount'] else 0)
            else:
                result += "  - 暂无历史价格数据（价格变动后会自动记录）\n\n"
                score = 100 - price

            # 综合评分：价格越低、趋势越向下，分数越高
            if score > best_score:
                best_score = score
                best_product = product

        if best_product:
            result += f"💡 **推荐**：{best_product.get('name')} ({best_product.get('price')} 元) - 综合最优\n"

        result += "\n如需查看其他商品请告诉我。"

        return result

    def _extract_product_name(self, message: str) -> Optional[str]:
        """从消息中提取商品名称"""
        import re
        # 去除常见前缀词
        clean = re.sub(r'(哪里|哪里便宜|多少钱|比价|价格|贵不贵|便宜)', '', message)
        clean = clean.strip()
        return clean if clean else None

    def _get_real_history(self, product_id: int, current_price: float) -> List[Dict[str, Any]]:
        """P1-2：从 Redis ZSET 读真实价格历史（price:history:{product_id}）

        没有历史数据时返回空列表（不造假）。
        数据由 NestJS 侧在菜品价格变动时写入（ZADD 时间戳为 score，价格为 member）。
        """
        try:
            from app.agents.base import get_redis
            key = f"price:history:{product_id}"
            # ZRANGE 取全部历史（member=价格, score=时间戳）
            raw = get_redis().zrange(key, 0, -1, withscores=True)
            history = [
                {"timestamp": int(ts), "price": float(price)}
                for price, ts in raw
            ]
            # 按时间正序排列
            history.sort(key=lambda x: x["timestamp"])
            return history
        except Exception:
            return []

    def _trend_emoji(self, trend: str) -> str:
        emoji_map = {
            "down": "📉",
            "up": "📈",
            "stable": "➡️",
            "unknown": "❓"
        }
        return emoji_map.get(trend, "❓")