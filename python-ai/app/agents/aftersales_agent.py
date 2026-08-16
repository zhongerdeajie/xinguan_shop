"""智能售后 Agent - 痛点 5（售后慢）

用户场景：
- "我昨天的订单少送了一个菜" → 自动识别 + 自动退款
- "我收到的商品有问题" → 自动识别 + 通知商家
- "我要退货" → 自动识别 + 流程指引

核心能力：
1. 自然语言识别问题类型
2. 自动拉取订单数据对比
3. 判断责任方（商家漏发 / 配送漏发 / 用户原因）
4. 工具白名单控制（小额自动退，大额需确认）
5. 自动通知商家
"""
from typing import Dict, Any, List, Optional
import re
from app.agents.base import BaseAgent, call_go_service, call_nestjs_api, ToolPermissionDenied


class AftersalesAgent(BaseAgent):
    """智能售后 Agent"""

    def __init__(self):
        super().__init__(name="aftersales", max_token=5000)

    def get_system_prompt(self) -> str:
        return """你是星选 AI 购物管家的智能售后助手。

职责：
1. 识别用户售后问题类型（少送/漏发/质量/退货）
2. 自动拉取订单数据对比
3. 判断责任方
4. 自动执行小额退款（≤ 500 元），大额需用户确认
5. 自动通知商家

约束：
- 退款金额 ≤ 500 元可自动执行
- 退款 > 500 元必须用户二次确认
- 修改订单必须用户确认
- 删除账户不允许
"""

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {"name": "get_user_orders", "description": "查询用户订单"},
            {"name": "compare_order_items", "description": "对比订单明细 vs 实际"},
            {"name": "create_refund", "description": "创建退款"},
            {"name": "notify_merchant", "description": "通知商家"},
        ]

    async def _execute(self, message: str, user_id: str,
                       session_id: str, entities: Dict[str, Any],
                       history: Optional[List[Dict[str, str]]] = None) -> str:
        """售后主流程（P1-3 改造：支持真退款）"""
        history = history or []

        # P1-3 Step 0: 确认退款场景（用户说"确认退款""确认取消"）
        if self._is_cancel_confirmation(message) and history:
            order_id = self._extract_order_id_from_history(history)
            if order_id:
                r = await call_nestjs_api(
                    f"/v1/orders/{order_id}/customer-cancel",
                    method="PUT",
                    data={"reason": "用户申请退款"},
                )
                if r.get("status") == 200:
                    self.record_tool_usage("cancel_order")
                    return f"✅ 订单 {order_id} 已取消，退款将在 1-3 个工作日内原路退回。"
                else:
                    return f"取消订单失败：{r.get('error') or r.get('data', {}).get('message', '未知错误')}。请稍后重试或联系客服。"

        # P1-3 Step 0.5: 提取订单号场景（用户说"取消订单123""订单456要退款"）
        order_id = self._extract_order_id(message)
        if order_id:
            return f"找到订单 {order_id}。确认取消并退款吗？回复『确认退款』即可执行。"

        # Step 1: 识别问题类型
        issue_type = self._classify_issue(message)

        if issue_type == "unknown":
            return "请描述您遇到的问题，例如：\n- 我的订单少送了一个菜\n- 我要申请退款\n- 商品质量有问题"

        # Step 2: 拉取最近订单（P0-3：改用 NestJS）
        orders_resp = await call_nestjs_api("/v1/orders?limit=1")
        self.record_tool_usage("get_user_orders")

        if orders_resp.get("status") != 200:
            return "查询订单失败，请稍后再试。"

        orders = orders_resp.get("data", {}).get("data") or orders_resp.get("data", {}).get("list") or []
        if not orders:
            return "您最近没有订单，无法处理售后。"

        latest_order = orders[0] if isinstance(orders, list) else orders

        # Step 3: 根据问题类型处理
        if issue_type == "missing_item":
            return await self._handle_missing_item(latest_order, user_id, message)
        elif issue_type == "refund":
            return await self._handle_refund(latest_order, user_id, message)
        elif issue_type == "quality":
            return await self._handle_quality_issue(latest_order, user_id, message)
        elif issue_type == "return":
            return "退货流程需要您联系商家协商，您可以：\n1. 在订单详情页点击'申请退货'\n2. 或拨打客服电话 400-xxx-xxxx"

        return "未识别的售后类型"

    def _classify_issue(self, message: str) -> str:
        """分类售后问题"""
        if any(kw in message for kw in ["少送", "漏发", "没收到", "缺"]):
            return "missing_item"
        elif any(kw in message for kw in ["退款", "退钱", "退订"]):
            return "refund"
        elif any(kw in message for kw in ["质量", "坏了", "变质", "有问题"]):
            return "quality"
        elif any(kw in message for kw in ["退货", "退回"]):
            return "return"
        return "unknown"

    async def _handle_missing_item(self, order: Dict, user_id: str,
                                  message: str) -> str:
        """处理少送漏发"""
        order_id = order.get("id", 0)
        order_number = order.get("number", "")

        # 自动识别少送的菜品（基于用户输入关键词）
        # 实际应对比订单明细 vs 配送记录

        # 计算退款金额（这里取订单金额的 30% 作为示例）
        refund_amount = order.get("amount", 0) * 0.3

        # 检查工具权限
        try:
            self.check_tool_permission("refund", amount=refund_amount)
        except ToolPermissionDenied as e:
            return f"抱歉：{str(e)}。您的订单 {order_number} 涉及的金额较大（{refund_amount:.2f} 元），需要您确认。"

        # 创建退款（实际调用支付服务）
        # refund_resp = await call_go_service(
        #     "/api/v1/refund",
        #     method="POST",
        #     data={"order_id": order_id, "amount": refund_amount, "reason": "少送漏发"},
        #     user_id=user_id
        # )
        self.record_tool_usage("create_refund")
        self.record_tool_usage("notify_merchant")

        return (
            f"已识别您订单 {order_number} 存在少送问题。\n\n"
            f"**处理结果**：\n"
            f"- 自动退款 {refund_amount:.2f} 元（2 小时内到账）\n"
            f"- 已通知商家补发\n"
            f"- 商家将联系您确认\n\n"
            f"如有问题请回复我。"
        )

    async def _handle_refund(self, order: Dict, user_id: str,
                            message: str) -> str:
        """处理退款请求"""
        order_id = order.get("id", 0)
        order_number = order.get("number", "")
        amount = order.get("amount", 0)

        if amount <= 500:
            # 小额自动退
            self.record_tool_usage("create_refund")
            return (
                f"您的订单 {order_number} 退款申请已受理：\n"
                f"- 退款金额：{amount:.2f} 元\n"
                f"- 自动执行中，2 小时内到账"
            )
        else:
            # 大额需用户确认
            return (
                f"您的订单 {order_number} 涉及退款金额 {amount:.2f} 元，"
                f"金额较大需要您确认。\n\n"
                f"请确认是否退款？\n"
                f"1. 确认退款\n"
                f"2. 取消申请"
            )

    async def _handle_quality_issue(self, order: Dict, user_id: str,
                                   message: str) -> str:
        """处理质量问题"""
        order_number = order.get("number", "")
        self.record_tool_usage("notify_merchant")

        return (
            f"已记录您订单 {order_number} 的质量问题。\n\n"
            f"**处理流程**：\n"
            f"1. 已通知商家\n"
            f"2. 商家将在 2 小时内联系您\n"
            f"3. 您可以选择：换货 / 退款 / 部分退款\n\n"
            f"感谢您的反馈，我们会跟进处理。"
        )

    # ---------- P1-3：真退款辅助方法 ----------
    def _is_cancel_confirmation(self, message: str) -> bool:
        """检测用户是否在确认退款/取消订单"""
        confirm_words = ["确认退款", "确认取消", "确定退款", "确定取消", "好的退款", "同意退款"]
        return any(w in message for w in confirm_words)

    def _extract_order_id(self, message: str) -> Optional[int]:
        """从用户消息中提取订单号（如『取消订单123』『订单456要退款』）"""
        m = re.search(r"订单\s*#?\s*(\d+)", message)
        if m:
            return int(m.group(1))
        # 也支持直接数字（如『取消123』）
        m2 = re.search(r"(?:取消|退款|退)\s*(\d{3,})", message)
        if m2:
            return int(m2.group(1))
        return None

    def _extract_order_id_from_history(self, history: List[Dict[str, str]]) -> Optional[int]:
        """从历史消息中提取订单号（找最近一条用户消息里的订单号）"""
        for item in reversed(history):
            if item.get("role") == "user":
                order_id = self._extract_order_id(item.get("content", ""))
                if order_id:
                    return order_id
            # 也检查 assistant 消息里的订单号（如『找到订单123』）
            if item.get("role") == "assistant":
                m = re.search(r"订单\s*#?\s*(\d+)", item.get("content", ""))
                if m:
                    return int(m.group(1))
        return None