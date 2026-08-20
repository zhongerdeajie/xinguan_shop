// Package review owns dish review submission and listing.
package review

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"go-service/internal/app/appdeps"
	"go-service/internal/middleware"
	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
)

// Handler exposes the per-request state for review endpoints.
type Handler struct {
	db   *pkgmysql.DB
	svcs appdeps.Services
}

// NewHandler wires the review handler.
func NewHandler(db *pkgmysql.DB, svcs appdeps.Services) *Handler {
	return &Handler{db: db, svcs: svcs}
}

// CreateReviewDTO 提交评价请求
type CreateReviewDTO struct {
	OrderID     int64  `json:"orderId" binding:"required"`
	DishID      int    `json:"dishId" binding:"required"`
	Rating      int    `json:"rating" binding:"required,min=1,max=5"`
	Content     string `json:"content"`
	Images      string `json:"images"`
	IsAnonymous int    `json:"isAnonymous"`
}

// Create 顾客提交一条菜品评价
//
// 校验: 该订单属于当前用户 + 该订单确实包含该菜品
// 写入: dish_review 表(只追加)
// 副作用: 更新 dish.rating 为最新平均值(替代原来的硬编码聚合)
func (h *Handler) Create(c *gin.Context) {
	userID, ok := middleware.CurrentUserID(c)
	if !ok {
		return
	}
	var dto CreateReviewDTO
	if err := c.ShouldBindJSON(&dto); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// 校验订单归属 + 包含该菜品
	var order model.Orders
	if err := h.db.WithContext(c.Request.Context()).
		Where("id = ? AND user_id = ?", dto.OrderID, userID).
		First(&order).Error; err != nil {
		c.JSON(400, gin.H{"error": "订单不存在或不属于当前用户"})
		return
	}
	var detail model.OrderDetail
	if err := h.db.WithContext(c.Request.Context()).
		Where("order_id = ? AND dish_id = ?", dto.OrderID, dto.DishID).
		First(&detail).Error; err != nil {
		c.JSON(400, gin.H{"error": "该订单不包含此菜品"})
		return
	}

	// 写评价(只追加)
	now := time.Now()
	// images 列是 JSON 数组, 空串或未传时要给合法 JSON(不能空字符串, 否则 MySQL 报 Invalid JSON)
	var imagesPtr *string
	if dto.Images != "" {
		imagesPtr = &dto.Images
	}
	review := &model.DishReview{
		OrderID:     dto.OrderID,
		UserID:      userID,
		DishID:      dto.DishID,
		Rating:      dto.Rating,
		Content:     dto.Content,
		Images:      imagesPtr,
		IsAnonymous: dto.IsAnonymous,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := h.db.WithContext(c.Request.Context()).Create(review).Error; err != nil {
		c.JSON(500, gin.H{"error": "评价失败"})
		return
	}

	// 更新菜品聚合评分(dish.rating = 该菜品所有评价的平均分)
	// 用 goroutine 异步做, 不阻塞评价返回; 失败只打日志
	// 关键: context 必须在 goroutine 内部创建, 不能在 handler 里 defer cancel
	//       否则 handler 返回时 bgCancel() 立即执行, goroutine 里的查询被 context canceled 打断
	go func(dishID int) {
		bgCtx, bgCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer bgCancel()
		h.recalcDishRating(bgCtx, dishID)
	}(dto.DishID)

	c.JSON(200, gin.H{"message": "评价成功", "data": review})
}

// recalcDishRating 重算某菜品的平均评分并写回 dish.rating
func (h *Handler) recalcDishRating(ctx context.Context, dishID int) {
	var avg struct {
		Avg float64
	}
	if err := h.db.WithContext(ctx).
		Model(&model.DishReview{}).
		Select("COALESCE(AVG(rating),0) AS avg").
		Where("dish_id = ?", dishID).
		Scan(&avg).Error; err != nil {
		fmt.Printf("[WARN] recalcDishRating AVG 查询失败 dish=%d err=%v\n", dishID, err)
		return
	}
	fmt.Printf("[INFO] recalcDishRating dish=%d avg=%.2f\n", dishID, avg.Avg)
	if err := h.db.WithContext(ctx).
		Model(&model.Dish{}).
		Where("id = ?", dishID).
		Update("rating", avg.Avg).Error; err != nil {
		fmt.Printf("[WARN] recalcDishRating UPDATE 失败 dish=%d err=%v\n", dishID, err)
		return
	}
	fmt.Printf("[INFO] recalcDishRating dish=%d rating 更新为 %.2f\n", dishID, avg.Avg)
}

// List 查某菜品的评价列表
func (h *Handler) List(c *gin.Context) {
	dishID, _ := strconv.Atoi(c.Param("id"))
	var reviews []model.DishReview
	if err := h.db.WithContext(c.Request.Context()).
		Where("dish_id = ?", dishID).
		Order("id DESC").Limit(50).Find(&reviews).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	// 匿名评价不暴露用户信息
	for i := range reviews {
		if reviews[i].IsAnonymous == 1 {
			reviews[i].UserID = 0
		}
	}
	c.JSON(200, gin.H{"data": reviews})
}
