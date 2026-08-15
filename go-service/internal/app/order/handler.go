// Package order owns the order submission and lookup handlers.
package order

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"go-service/internal/app/appdeps"
	"go-service/internal/middleware"
	"go-service/internal/model"
)

// Handler exposes the per-request state for order endpoints.
type Handler struct {
	svcs appdeps.Services
}

// NewHandler wires the order handler.
func NewHandler(svcs appdeps.Services) *Handler {
	return &Handler{svcs: svcs}
}

// Submit creates an order from the cart contents of the authenticated user.
func (h *Handler) Submit(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	var dto model.OrderSubmitDTO
	if err := c.ShouldBindJSON(&dto); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	order, err := h.svcs.Order.SubmitOrder(c.Request.Context(), userID, dto)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "下单成功", "data": order})
}

// List returns paginated orders for the authenticated user.
func (h *Handler) List(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	query := model.OrderPageQueryDTO{
		Page:     parseInt(c.DefaultQuery("page", "1")),
		PageSize: parseInt(c.DefaultQuery("pageSize", "10")),
		Status:   parseInt(c.DefaultQuery("status", "0")),
	}
	result, err := h.svcs.Order.GetOrderList(c.Request.Context(), userID, query)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"data": result})
}

// Detail returns a single order for the authenticated user.
func (h *Handler) Detail(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	orderID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	vo, err := h.svcs.Order.GetOrderDetail(c.Request.Context(), int64(userID), orderID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"data": vo})
}

// Cancel cancels a pending order owned by the authenticated user.
func (h *Handler) Cancel(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	var dto model.OrderCancelDTO
	if err := c.ShouldBindJSON(&dto); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Order.CancelOrder(c.Request.Context(), userID, dto); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "取消成功"})
}

func parseInt(s string) int {
	i, _ := strconv.Atoi(s)
	return i
}
