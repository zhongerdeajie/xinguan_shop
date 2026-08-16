package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	redis9 "github.com/redis/go-redis/v9"
	"go-service/internal/app"
	"go-service/internal/app/appdeps"
	"go-service/internal/config"
	"go-service/internal/middleware"
	"go-service/internal/model"
	"go-service/internal/pkg/mysql"
	"go-service/internal/pkg/redis"
)

// @title School System Go Concurrency Service
// @version 1.0
// @description 高并发选课/排课服务 - Go + Gin
// @host localhost:8081
// @BasePath /api/v1
func main() {
	cfg := config.Load()

	// 初始化 Redis
	rdb, err := redis.NewClient(cfg.Redis)
	if err != nil {
		log.Fatalf("Redis init failed: %v", err)
	}
	defer rdb.Close()

	// 初始化 MySQL（带重试）
	db, err := mysql.NewDB(cfg.MySQL)
	for i := 1; err != nil && i <= 30; i++ {
		log.Printf("MySQL connection attempt %d/30 failed: %v", i, err)
		time.Sleep(2 * time.Second)
		db, err = mysql.NewDB(cfg.MySQL)
	}
	if err != nil {
		log.Fatalf("MySQL init failed after 30 attempts: %v", err)
	}
	defer db.Close()

	// 初始化菜品价格历史（近 90 天，Redis ZSET；已有数据则跳过）
	seedPriceHistory(db, rdb)

	// Gin 路由
	gin.SetMode(cfg.GinMode)
	r := gin.New()
	r.Use(gin.Recovery(), gin.Logger(), middleware.CORS(), middleware.RateLimit(rdb, 20, time.Second))

	// 注册路由
	app.Register(r, appdeps.Deps{
		DB:        db,
		Redis:     rdb,
		JWTSecret: cfg.JWTSecret,
	})

	// HTTP Server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 优雅关闭
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Server exited")
}

// seedPriceHistory 为每道菜回填近 90 天价格历史（Redis ZSET），已有数据则跳过
func seedPriceHistory(db *mysql.DB, rdb *redis.Client) {
	var dishes []model.Dish
	if err := db.Model(&model.Dish{}).Select("id, price").Find(&dishes).Error; err != nil {
		log.Printf("seedPriceHistory: %v", err)
		return
	}
	ctx := context.Background()
	now := time.Now()
	for _, d := range dishes {
		key := fmt.Sprintf("price:history:%d", d.ID)
		n, err := rdb.ZCard(ctx, key).Result()
		if err == nil && n > 0 {
			continue
		}
		zs := make([]redis9.Z, 0, 90)
		for i := 89; i >= 0; i-- {
			ts := now.Add(-time.Duration(i) * 24 * time.Hour)
			price := d.Price
			// 模拟：每 7 天一次促销日（打 9 折），其余为日常价
			if i%7 == 3 {
				price = d.Price * 0.9
			}
			zs = append(zs, redis9.Z{
				Score:  float64(ts.Unix()),
				Member: fmt.Sprintf("%.2f@%d", price, ts.Unix()),
			})
		}
		if _, err := rdb.ZAdd(ctx, key, zs...).Result(); err != nil {
			log.Printf("seedPriceHistory dish %d: %v", d.ID, err)
		}
	}
	log.Printf("✅ 价格历史初始化完成，共 %d 道菜", len(dishes))
}
