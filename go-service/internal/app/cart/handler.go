// Package cart owns the shopping cart handlers.
package cart

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"go-service/internal/app/appdeps"
	"go-service/internal/middleware"
	"go-service/internal/model"
)

// Handler exposes the per-request state for cart endpoints.
type Handler struct {
	svcs appdeps.Services
}

// NewHandler wires the cart handler. Cart endpoints only need the order
// service which already has access to the database and redis.
func NewHandler(svcs appdeps.Services) *Handler {
	return &Handler{svcs: svcs}
}

// Add adds a dish or setmeal to the cart for the authenticated user.
func (h *Handler) Add(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	var dto model.CartItemDTO
	if err := c.ShouldBindJSON(&dto); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Order.AddToCart(c.Request.Context(), userID, dto); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "添加成功"})
}

// List returns the cart for the authenticated user.
func (h *Handler) List(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	items, err := h.svcs.Order.GetCartList(c.Request.Context(), userID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"data": items})
}

// Update changes the quantity of an existing cart line item.
func (h *Handler) Update(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	cartID, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Number int `json:"number" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Order.UpdateCartNumber(c.Request.Context(), userID, cartID, req.Number); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "更新成功"})
}

// DeleteItem removes a single line from the cart.
func (h *Handler) DeleteItem(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	cartID, _ := strconv.Atoi(c.Param("id"))
	if err := h.svcs.Order.DeleteCartItem(c.Request.Context(), userID, cartID); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "删除成功"})
}

// Clear empties the cart for the authenticated user.
func (h *Handler) Clear(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	if err := h.svcs.Order.ClearCart(c.Request.Context(), userID); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "清空成功"})
}
