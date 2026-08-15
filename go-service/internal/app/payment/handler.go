// Package payment owns the payment and refund handlers.
package payment

import (
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
	if err := h.svcs.Order.RefundOrder(c.Request.Context(), userID, orderID); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "退款成功", "orderId": orderID})
}
