// Package user owns the customer-facing user admin handlers.
package user

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"go-service/internal/app/appdeps"
	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
	pkgpagination "go-service/internal/pkg/pagination"
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

// List returns a paginated list of customer users.
// Sensitive fields like IDNumber are masked before being sent to the client.
func (h *Handler) List(c *gin.Context) {
	offset, limit := pkgpagination.ParsePaging(c)

	var users []model.User
	var total int64
	h.db.Model(&model.User{}).Count(&total)
	h.db.Offset(offset).Limit(limit).Order("id DESC").Find(&users)

	// Mask sensitive fields before serializing.
	for i := range users {
		users[i].IDNumber = pkgpagination.MaskIDNumber(users[i].IDNumber)
	}

	c.JSON(200, gin.H{
		"data": users,
		"meta": gin.H{
			"total":     total,
			"page":      offset/limit + 1,
			"pageSize":  limit,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// GetByID returns one customer user.
func (h *Handler) GetByID(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var user model.User
	if err := h.db.Where("id = ?", id).First(&user).Error; err != nil {
		c.JSON(404, gin.H{"error": "用户不存在"})
		return
	}
	// Mask sensitive field for single-record response too.
	user.IDNumber = pkgpagination.MaskIDNumber(user.IDNumber)
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
