// Package user owns the customer-facing user admin handlers.
package user

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"go-service/internal/app/appdeps"
	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
)

// Handler exposes the per-request state for user endpoints.
type Handler struct {
	db   *pkgmysql.DB
	svcs appdeps.Services
}

// NewHandler wires the user handler.
func NewHandler(db *pkgmysql.DB, svcs appdeps.Services) *Handler {
	return &Handler{db: db, svcs: svcs}
}

// List returns every customer user.
func (h *Handler) List(c *gin.Context) {
	var users []model.User
	h.db.Find(&users)
	c.JSON(200, gin.H{"data": users})
}

// GetByID returns one customer user.
func (h *Handler) GetByID(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var user model.User
	if err := h.db.Where("id = ?", id).First(&user).Error; err != nil {
		c.JSON(404, gin.H{"error": "用户不存在"})
		return
	}
	c.JSON(200, gin.H{"data": user})
}

// Create persists a new customer user.
func (h *Handler) Create(c *gin.Context) {
	var user model.User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Write.CreateUser(c.Request.Context(), &user); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "创建成功", "data": user})
}

// Update applies the partial update map to the user.
func (h *Handler) Update(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Write.UpdateUser(c.Request.Context(), id, updates); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "更新成功"})
}
