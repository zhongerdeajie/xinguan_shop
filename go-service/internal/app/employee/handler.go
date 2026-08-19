// Package employee owns the employee admin handlers.
package employee

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"go-service/internal/app/appdeps"
	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
	pkgpagination "go-service/internal/pkg/pagination"
)

// Handler is the per-request state needed by employee endpoints.
type Handler struct {
	db   *pkgmysql.DB
	svcs appdeps.Services
}

// NewHandler wires the handler. It deliberately takes only the dependencies
// it actually uses.
func NewHandler(db *pkgmysql.DB, svcs appdeps.Services) *Handler {
	return &Handler{db: db, svcs: svcs}
}

// List returns a paginated list of employees.
// Sensitive fields like IDNumber are masked before being sent to the client.
func (h *Handler) List(c *gin.Context) {
	offset, limit := pkgpagination.ParsePaging(c)

	var employees []model.Employee
	var total int64
	h.db.Model(&model.Employee{}).Count(&total)
	h.db.Offset(offset).Limit(limit).Order("id DESC").Find(&employees)

	// Mask sensitive fields before serializing.
	for i := range employees {
		employees[i].IDNumber = pkgpagination.MaskIDNumber(employees[i].IDNumber)
	}

	c.JSON(200, gin.H{
		"data": employees,
		"meta": gin.H{
			"total":      total,
			"page":       offset/limit + 1,
			"pageSize":   limit,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// Create persists a new employee.
func (h *Handler) Create(c *gin.Context) {
	var emp model.Employee
	if err := c.ShouldBindJSON(&emp); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Write.CreateEmployee(c.Request.Context(), &emp); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "创建成功", "data": emp})
}

// Update applies the partial update map to the employee.
func (h *Handler) Update(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Write.UpdateEmployee(c.Request.Context(), id, updates); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "更新成功"})
}

// Delete removes the employee identified by the URL id.
func (h *Handler) Delete(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := h.svcs.Write.DeleteEmployee(c.Request.Context(), id); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "删除成功"})
}
