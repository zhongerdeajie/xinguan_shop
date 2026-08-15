// Package setmeal owns the setmeal admin handlers.
package setmeal

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"go-service/internal/app/appdeps"
	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
)

// Handler exposes the per-request state for setmeal endpoints.
type Handler struct {
	db   *pkgmysql.DB
	svcs appdeps.Services
}

// NewHandler wires the handler.
func NewHandler(db *pkgmysql.DB, svcs appdeps.Services) *Handler {
	return &Handler{db: db, svcs: svcs}
}

// List returns every setmeal in the table.
func (h *Handler) List(c *gin.Context) {
	var setmeals []model.Setmeal
	h.db.Find(&setmeals)
	c.JSON(200, gin.H{"data": setmeals})
}

// Create inserts a new setmeal.
func (h *Handler) Create(c *gin.Context) {
	var setmeal model.Setmeal
	if err := c.ShouldBindJSON(&setmeal); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Write.CreateSetmeal(c.Request.Context(), &setmeal); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "创建成功", "data": setmeal})
}

// Update applies the partial update map to the setmeal.
func (h *Handler) Update(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Write.UpdateSetmeal(c.Request.Context(), id, updates); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "更新成功"})
}

// Delete removes the setmeal identified by id.
func (h *Handler) Delete(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := h.svcs.Write.DeleteSetmeal(c.Request.Context(), id); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "删除成功"})
}
