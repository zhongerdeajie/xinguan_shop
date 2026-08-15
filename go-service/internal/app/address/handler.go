// Package address owns the customer address-book handlers.
package address

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"go-service/internal/app/appdeps"
	"go-service/internal/middleware"
	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
)

// Handler exposes the per-request state for address endpoints.
type Handler struct {
	db   *pkgmysql.DB
	svcs appdeps.Services
}

// NewHandler wires the address handler.
func NewHandler(db *pkgmysql.DB, svcs appdeps.Services) *Handler {
	return &Handler{db: db, svcs: svcs}
}

// Create persists a new address belonging to the authenticated user.
func (h *Handler) Create(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	var addr model.AddressBook
	if err := c.ShouldBindJSON(&addr); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	addr.UserID = userID
	if err := h.svcs.Write.CreateAddressBook(c.Request.Context(), &addr); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "创建成功", "data": addr})
}

// List returns the address book of the authenticated user.
func (h *Handler) List(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	var addresses []model.AddressBook
	h.db.Where("user_id = ?", userID).Find(&addresses)
	c.JSON(200, gin.H{"data": addresses})
}

// Update applies the partial update to the user's own address book entry.
func (h *Handler) Update(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	delete(updates, "userId")
	delete(updates, "user_id")
	if err := h.svcs.Write.UpdateAddressBook(c.Request.Context(), userID, id, updates); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "更新成功"})
}

// Delete removes one of the user's addresses.
func (h *Handler) Delete(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	if err := h.svcs.Write.DeleteAddressBook(c.Request.Context(), userID, id); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "删除成功"})
}

// SetDefault marks the address as the default for the authenticated user.
func (h *Handler) SetDefault(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	addrID, _ := strconv.Atoi(c.Param("id"))
	if err := h.svcs.Write.SetDefaultAddress(c.Request.Context(), userID, addrID); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "设置默认地址成功"})
}
