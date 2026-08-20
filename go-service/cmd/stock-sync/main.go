// Package main - stock-sync worker
//
// 每 5 分钟扫描所有菜品:
//   1. 取 MySQL.dish.stock 与 Redis dish:{id}:stock
//   2. 漂移 > 0 → 自动 IncrBy 补偿 + 写 stock_audit_log
//   3. 漂移 < 0 → 警告(Redis 库存比 MySQL 多,可能是订单未消费完)
//   4. Prometheus 指标更新
//
// 用法:
//   go run ./cmd/stock-sync
//
// 注意: dish.stock 是真相;Redis 是预占缓存。
// 漂移的常见原因:
//   - Go service 重启时 pending:order 还在, 但 worker 没启动
//   - 手动更新菜品库存时漏改 Redis
//   - Lua 脚本 crash (Redis 7.x 罕见)
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"go-service/internal/config"
	pkgmysql "go-service/internal/pkg/mysql"
	pkgredis "go-service/internal/pkg/redis"
	"gorm.io/gorm"
)

// Prometheus 指标(简易版, 没用 prom client, 直接 atomic + /metrics 文本)
type Metrics struct {
	DriftTotal  atomic.Int64
	FixedTotal  atomic.Int64
	ScanCount   atomic.Int64
	StartedAt   time.Time
}

func (m *Metrics) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		w.Write([]byte("# HELP stock_drift_total Sum of observed Redis-MySQL stock drift\n"))
		w.Write([]byte("# TYPE stock_drift_total counter\n"))
		w.Write([]byte("stock_drift_total " + itoa(m.DriftTotal.Load()) + "\n"))
		w.Write([]byte("# HELP stock_fixed_total How many drift events we auto-compensated\n"))
		w.Write([]byte("# TYPE stock_fixed_total counter\n"))
		w.Write([]byte("stock_fixed_total " + itoa(m.FixedTotal.Load()) + "\n"))
		w.Write([]byte("# HELP stock_scan_total Total number of stock sync scans\n"))
		w.Write([]byte("# TYPE stock_scan_total counter\n"))
		w.Write([]byte("stock_scan_total " + itoa(m.ScanCount.Load()) + "\n"))
		w.Write([]byte("# HELP stock_sync_uptime_seconds Worker uptime in seconds\n"))
		w.Write([]byte("# TYPE stock_sync_uptime_seconds gauge\n"))
		w.Write([]byte("stock_sync_uptime_seconds " + itoa64(int64(time.Since(m.StartedAt).Seconds())) + "\n"))
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	return mux
}

func itoa(v int64) string { return fmtInt(v) }

func itoa64(v int64) string { return fmtInt(v) }

// fmtInt 避免 fmt 占用格式化包
func fmtInt(v int64) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	buf := make([]byte, 0, 20)
	for v > 0 {
		buf = append([]byte{byte('0' + v%10)}, buf...)
		v /= 10
	}
	if neg {
		return "-" + string(buf)
	}
	return string(buf)
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds | log.Lshortfile)
	log.Println("📊 stock-sync worker 启动")

	cfg := config.Load()
	db, err := pkgmysql.InitWithRetry(cfg.MySQL, 30)
	if err != nil {
		log.Fatalf("MySQL 失败: %v", err)
	}
	defer db.Close()

	rdb, err := pkgredis.NewClient(cfg.Redis)
	if err != nil {
		log.Fatalf("Redis 失败: %v", err)
	}
	defer rdb.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	metrics := &Metrics{StartedAt: time.Now()}

	// HTTP /metrics
	srv := &http.Server{Addr: ":8082", Handler: metrics.Handler()}
	go func() {
		log.Printf("📈 metrics 监听 :8082/metrics")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("metrics server error: %v", err)
		}
	}()
	defer func() {
		shCtx, shCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer shCancel()
		_ = srv.Shutdown(shCtx)
	}()

	// 优雅退出
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-quit
		log.Println("收到退出信号")
		cancel()
	}()

	runSync(ctx, db, rdb, metrics)
	log.Println("stock-sync 已退出")
}

func runSync(ctx context.Context, db *pkgmysql.DB, rdb *pkgredis.Client, m *Metrics) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	// 启动立即跑一次
	scanOnce(ctx, db, rdb, m)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			scanOnce(ctx, db, rdb, m)
		}
	}
}

func scanOnce(ctx context.Context, db *pkgmysql.DB, rdb *pkgredis.Client, m *Metrics) {
	m.ScanCount.Add(1)

	type Row struct {
		ID    int
		Stock int
	}
	var dishes []Row
	if err := db.WithContext(ctx).Table("dish").Select("id, stock").Scan(&dishes).Error; err != nil {
		log.Printf("scanOnce: 拉菜品失败: %v", err)
		return
	}

	ctx2, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	pipe := rdb.Pipeline()
	cmds := make([]*redis.StringCmd, len(dishes))
	for i, d := range dishes {
		key := keyFor(d.ID)
		cmds[i] = pipe.Get(ctx2, key)
	}
	if _, err := pipe.Exec(ctx2); err != nil && err != redis.Nil {
		log.Printf("scanOnce: pipeline 失败: %v", err)
		return
	}

	for i, d := range dishes {
		var redisStock int64 = -1 // -1 表示 key 不存在
		val, err := cmds[i].Int64()
		if err == nil {
			redisStock = val
		} else if err != redis.Nil {
			log.Printf("菜品 %d 取 Redis 库存失败: %v", d.ID, err)
			continue
		}

		if redisStock < 0 {
			// key 不存在: 拿 MySQL 真值初始化
			if err := rdb.Set(ctx2, keyFor(d.ID), d.Stock, 24*time.Hour).Err(); err != nil {
				log.Printf("菜品 %d 初始化 Redis 失败: %v", d.ID, err)
			} else {
				log.Printf("🍳 菜品 %d Redis 库存初始化 = %d (来自 MySQL)", d.ID, d.Stock)
			}
			continue
		}

		drift := redisStock - int64(d.Stock)
		if drift == 0 {
			continue // 完美, 跳过
		}

		m.DriftTotal.Add(drift)
		log.Printf("⚠️  菜品 %d 漂移 redis=%d mysql=%d drift=%+d", d.ID, redisStock, d.Stock, drift)

		// 写审计
		auditDrift(ctx, db, d.ID, d.Stock, int(redisStock), drift, "auto_scan")

		if drift > 0 {
			// Redis 比 MySQL 多 → IncrBy 让 Redis 跟 MySQL 对齐
			// 说明: 这种漂移通常意味着 Redis 有库存被"占用但没提交"(pending 还在)
			// 安全做法: 等 outbox-worker 处理完再校准; 这里先打个标记
			// 简单做法: 直接 IncrBy 补偿差额, 让两边对齐
			newVal := int64(d.Stock)
			if err := rdb.Set(ctx2, keyFor(d.ID), newVal, 24*time.Hour).Err(); err != nil {
				log.Printf("补偿菜品 %d 失败: %v", d.ID, err)
				continue
			}
			m.FixedTotal.Add(1)
			log.Printf("✅ 菜品 %d Redis 库存校准为 %d", d.ID, newVal)
		}
		// drift < 0 (Redis 比 MySQL 少) → 不能盲目加, 让人工处理
		// (可能是真卖多了, 也可能是 Redis 被清空; 都要查)
	}
}

func keyFor(dishID int) string {
	return "dish:" + itoa(int64(dishID)) + ":stock"
}

func auditDrift(ctx context.Context, db *pkgmysql.DB, dishID, mysqlStock, redisStock int, drift int64, action string) {
	if err := db.WithContext(ctx).Exec(`
        INSERT INTO stock_audit_log
            (dish_id, mysql_stock, redis_stock, drift, action, created_at)
        VALUES (?, ?, ?, ?, ?, NOW(3))
    `, dishID, mysqlStock, redisStock, drift, action).Error; err != nil {
		log.Printf("写审计失败 dish=%d: %v", dishID, err)
	}
}

// 避免导入用不到的 gorm.DB
var _ = gorm.ErrRecordNotFound