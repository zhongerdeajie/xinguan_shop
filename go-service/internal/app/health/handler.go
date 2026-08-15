// Package health owns the liveness probe and the category listing.
package health

import (
	"github.com/gin-gonic/gin"

	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
)

// Handler exposes the per-request state for health endpoints.
type Handler struct {
	db *pkgmysql.DB
}

// NewHandler wires the handler with the database (category listing needs it).
func NewHandler(db *pkgmysql.DB) *Handler {
	return &Handler{db: db}
}

// Health is the unauthenticated liveness probe.
func (h *Handler) Health(c *gin.Context) {
	c.JSON(200, gin.H{"status": "ok", "service": "go-ecommerce-service"})
}

// Categories lists every active category sorted by the configured sort
// weight.
func (h *Handler) Categories(c *gin.Context) {
	var categories []model.Category
	if err := h.db.Where("status = ?", 1).Order("sort ASC").Find(&categories).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"data": categories})
}
