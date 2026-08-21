// Package audit 管理端审计查询(退款流水 / 库存审计)
//
// 这些是只读查询, 供管理员对账/排查用:
//   - GET /api/v1/admin/audit/refunds?orderId=123&page=1&pageSize=20
//   - GET /api/v1/admin/audit/stock?dishId=1&page=1&pageSize=50
package audit

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	pkgmysql "go-service/internal/pkg/mysql"
)

// Handler 审计查询 handler(只读, 不需要 service, 直接查库)
type Handler struct {
	db *pkgmysql.DB
}

func NewHandler(db *pkgmysql.DB) *Handler {
	return &Handler{db: db}
}

// ListRefunds 查询退款流水(可按 orderId / userId 过滤)
func (h *Handler) ListRefunds(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	orderID, _ := strconv.ParseInt(c.DefaultQuery("orderId", "0"), 10, 64)
	userID, _ := strconv.Atoi(c.DefaultQuery("userId", "0"))

	where := "1=1"
	args := []interface{}{}
	if orderID > 0 {
		where += " AND order_id = ?"
		args = append(args, orderID)
	}
	if userID > 0 {
		where += " AND user_id = ?"
		args = append(args, userID)
	}

	// 总数
	var total int64
	if err := h.db.WithContext(c.Request.Context()).Raw(
		"SELECT COUNT(*) FROM refund_log WHERE "+where, args...,
	).Scan(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询退款流水失败"})
		return
	}

	// 分页数据
	type Row struct {
		ID           int64   `json:"id"`
		PaymentLogID int64   `json:"paymentLogId"`
		OrderID      int64   `json:"orderId"`
		UserID       int     `json:"userId"`
		RefundAmount float64 `json:"refundAmount"`
		RefundReason string  `json:"refundReason"`
		TransactionID string `json:"transactionId"`
		Status       int     `json:"status"`
		CreatedAt    string  `json:"createdAt"`
	}
	var rows []Row
	query := "SELECT id, payment_log_id, order_id, user_id, refund_amount, refund_reason, transaction_id, status, created_at FROM refund_log WHERE " + where + " ORDER BY id DESC LIMIT ? OFFSET ?"
	args = append(args, pageSize, (page-1)*pageSize)
	if err := h.db.WithContext(c.Request.Context()).Raw(query, args...).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询退款流水失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": rows,
		"meta": gin.H{
			"total":      total,
			"page":       page,
			"pageSize":   pageSize,
			"totalPages": (int(total) + pageSize - 1) / pageSize,
		},
	})
}

// ListStockAudits 查询库存审计(按 dishId 过滤)
func (h *Handler) ListStockAudits(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}
	dishID, _ := strconv.Atoi(c.DefaultQuery("dishId", "0"))

	where := "1=1"
	args := []interface{}{}
	if dishID > 0 {
		where += " AND dish_id = ?"
		args = append(args, dishID)
	}

	var total int64
	if err := h.db.WithContext(c.Request.Context()).Raw(
		"SELECT COUNT(*) FROM stock_audit_log WHERE "+where, args...,
	).Scan(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询库存审计失败"})
		return
	}

	type Row struct {
		ID         int64   `json:"id"`
		DishID     int     `json:"dishId"`
		MySQLStock int     `json:"mysqlStock"`
		RedisStock int     `json:"redisStock"`
		Drift      int     `json:"drift"`
		Action     string  `json:"action"`
		Note       string  `json:"note"`
		CreatedAt  string  `json:"createdAt"`
	}
	var rows []Row
	query := "SELECT id, dish_id, mysql_stock, redis_stock, drift, action, note, created_at FROM stock_audit_log WHERE " + where + " ORDER BY id DESC LIMIT ? OFFSET ?"
	args = append(args, pageSize, (page-1)*pageSize)
	if err := h.db.WithContext(c.Request.Context()).Raw(query, args...).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询库存审计失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": rows,
		"meta": gin.H{
			"total":      total,
			"page":       page,
			"pageSize":   pageSize,
			"totalPages": (int(total) + pageSize - 1) / pageSize,
		},
	})
}
