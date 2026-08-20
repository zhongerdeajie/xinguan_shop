// Package payment owns the payment and refund handlers.
package payment

import (
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"go-service/internal/app/appdeps"
	"go-service/internal/middleware"
	"go-service/internal/model"
)

// Handler exposes the per-request state for payment endpoints.
type Handler struct {
	svcs appdeps.Services
}

// NewHandler wires the payment handler.
func NewHandler(svcs appdeps.Services) *Handler {
	return &Handler{svcs: svcs}
}

func useV2() bool {
	return os.Getenv("USE_ORDER_V2") != "0"
}

// Pay marks an order as paid.
func (h *Handler) Pay(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	var dto model.OrderPaymentDTO
	if err := c.ShouldBindJSON(&dto); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Order.PayOrder(c.Request.Context(), userID, dto); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "支付成功"})
}

// Refund cancels a paid order and returns the dish stock.
//
// v2 路径关键修复:
//   - 老路径: 先 Redis IncrBy 回补, 再调 RefundOrder (失败 → 反向超卖)
//   - 新路径: 先 MySQL FOR UPDATE 改状态, 再异步 ReleaseStock (失败可重试)
func (h *Handler) Refund(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	orderIDStr := c.Param("orderId")
	orderID, err := strconv.ParseInt(strings.TrimPrefix(orderIDStr, "/"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "无效的订单ID"})
		return
	}

	if useV2() {
		if err := h.svcs.OrderV2.RefundOrder(c.Request.Context(), userID, orderID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"message": "退款成功", "orderId": orderID})
		return
	}

	if err := h.svcs.Order.RefundOrder(c.Request.Context(), userID, orderID); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "退款成功", "orderId": orderID})
}
