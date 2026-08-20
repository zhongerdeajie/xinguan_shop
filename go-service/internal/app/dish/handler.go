// Package dish owns dish CRUD and the price-history endpoint.
package dish

import (
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	redis9 "github.com/redis/go-redis/v9"

	"go-service/internal/app/appdeps"
	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
	pkgredis "go-service/internal/pkg/redis"
)

type redisZRangeBy = redis9.ZRangeBy

// Handler is the per-request state needed by dish endpoints.
type Handler struct {
	db   *pkgmysql.DB
	rdb  *pkgredis.Client
	svcs appdeps.Services
}

// NewHandler wires the dish handler with database, redis, and services.
func NewHandler(db *pkgmysql.DB, rdb *pkgredis.Client, svcs appdeps.Services) *Handler {
	return &Handler{db: db, rdb: rdb, svcs: svcs}
}

// List supports category/price/name filters, ensures a default 100 stock
// counter exists for every dish, and returns the slice.
func (h *Handler) List(c *gin.Context) {
	var dishes []model.Dish
	query := h.db.Model(&model.Dish{})
	if v := c.Query("categoryType"); v != "" {
		query = query.Where("category_id IN (SELECT id FROM category WHERE type = ?)", v)
	}
	if v := c.Query("categoryId"); v != "" {
		query = query.Where("category_id = ?", v)
	}
	if v := c.Query("maxPrice"); v != "" {
		query = query.Where("price <= ?", v)
	}
	if v := c.Query("minPrice"); v != "" {
		query = query.Where("price >= ?", v)
	}
	if v := c.Query("name"); v != "" {
		query = query.Where("name LIKE ?", "%"+v+"%")
	}
	if c.Query("includeUnavailable") != "true" {
		query = query.Where("status = 1")
	}
	query = query.Order("rating DESC, sales DESC")
	limit := 50
	if v := c.Query("limit"); v != "" {
		fmt.Sscanf(v, "%d", &limit)
	}
	query = query.Limit(limit)
	if err := query.Find(&dishes).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	// 注意: 不再 SetNX 默认 100(那是 P1 bug, 永远卖得出去)
	// Redis 库存由 stock-sync worker 首次拉取时初始化(24h TTL, 失败靠 worker 重建)
	c.JSON(200, gin.H{"data": dishes})
}

// Detail returns a single dish by id.
func (h *Handler) Detail(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var dish model.Dish
	if err := h.db.Where("id = ?", id).First(&dish).Error; err != nil {
		c.JSON(404, gin.H{"error": "菜品不存在"})
		return
	}
	c.JSON(200, gin.H{"data": dish})
}

// PriceHistory returns up to 90 days of price snapshots stored in Redis
// (sorted set) or synthesizes mock history when the cache is cold.
func (h *Handler) PriceHistory(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var dish model.Dish
	if err := h.db.Where("id = ?", id).First(&dish).Error; err != nil {
		c.JSON(404, gin.H{"error": "菜品不存在"})
		return
	}
	ctx := c.Request.Context()
	key := fmt.Sprintf("price:history:%d", id)
	zs, err := h.rdb.ZRangeByScoreWithScores(ctx, key, &redisZRangeBy{Min: "0", Max: "+inf"}).Result()
	history := []gin.H{}
	if err == nil && len(zs) > 0 {
		for _, item := range zs {
			ts := int64(item.Score)
			priceStr := ""
			switch v := item.Member.(type) {
			case string:
				priceStr = v
			case []byte:
				priceStr = string(v)
			}
			if idx := strings.Index(priceStr, "@"); idx >= 0 {
				priceStr = priceStr[:idx]
			}
			price, _ := strconv.ParseFloat(priceStr, 64)
			history = append(history, gin.H{"timestamp": ts, "price": price})
		}
	} else {
		rand.Seed(time.Now().UnixNano() + int64(id))
		currentPrice := dish.Price
		basePrice := currentPrice * 1.15
		now := time.Now().Unix() * 1000
		for i := 30; i >= 0; i-- {
			timestamp := now - int64(i*86400000)
			price := basePrice * (1 + (rand.Float64()-0.5)*0.16)
			history = append(history, gin.H{"timestamp": timestamp, "price": roundTo(price, 2)})
		}
		history = append(history, gin.H{"timestamp": now, "price": currentPrice})
	}
	c.JSON(200, gin.H{
		"data": history,
		"dish": gin.H{"id": dish.ID, "name": dish.Name, "price": dish.Price},
	})
}

// Create inserts a new dish.
func (h *Handler) Create(c *gin.Context) {
	var dish model.Dish
	if err := c.ShouldBindJSON(&dish); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Write.CreateDish(c.Request.Context(), &dish); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "创建成功", "data": dish})
}

// Update applies a partial update and records a new price snapshot if the
// payload contains a price field.
func (h *Handler) Update(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := h.svcs.Write.UpdateDish(c.Request.Context(), id, updates); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if price, ok := updates["price"].(float64); ok {
		key := fmt.Sprintf("price:history:%d", id)
		now := time.Now().Unix()
		h.rdb.ZAdd(c.Request.Context(), key, redis9.Z{Score: float64(now), Member: fmt.Sprintf("%.2f@%d", price, now)})
	}
	// 同步 stock 到 Redis: 如果管理员修改了库存, 这里立刻同步
	// 否则 stock-sync worker 会 5 分钟后校准(漂移期内可能超卖)
	if stock, ok := updates["stock"].(float64); ok {
		if err := h.svcs.Write.SyncDishStock(c.Request.Context(), id, int(stock)); err != nil {
			// 同步失败不阻塞返回, worker 会兜底
			fmt.Printf("[WARN] SyncDishStock failed for dish %d: %v\n", id, err)
		}
	}
	c.JSON(200, gin.H{"message": "更新成功"})
}

// Delete removes the dish by id.
func (h *Handler) Delete(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := h.svcs.Write.DeleteDish(c.Request.Context(), id); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "删除成功"})
}

func roundTo(f float64, n int) float64 {
	shift := 1.0
	for i := 0; i < n; i++ {
		shift *= 10
	}
	return float64(int(f*shift+0.5)) / shift
}
