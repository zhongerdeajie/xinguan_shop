// Package main - outbox-worker
//
// 消费 outbox_events 表,把事件投递到 Redis Streams + 处理副作用
// 失败自动重试, 3 次后标记 failed (人工介入)
//
// 用法:
//   go run ./cmd/outbox-worker
//   或 docker-compose up go-outbox-worker
//
// 为什么需要:
//   - CreateOrder 提交后, 副作用(推 WebSocket / 发短信) 必须不阻塞主链路
//   - 直接 MySQL → WebSocket → 客户端一旦失败, 整个下单流程都会失败
//   - Outbox 模式: 业务事务里只 INSERT 一条事件, 副作用交给 worker 异步
//   - 即使 worker 挂了, 下单不受影响; 重启后从 DB 拉取继续处理
package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"go-service/internal/config"
	pkgmysql "go-service/internal/pkg/mysql"
	pkgredis "go-service/internal/pkg/redis"
	"go-service/internal/service"
)

const (
	// EventStreamName Redis Stream 名
	EventStreamName = "order:events"
	// ConsumerGroup 消费者组
	ConsumerGroup = "outbox-worker"
	// MaxRetry 重试次数
	MaxRetry = 3
	// BatchSize 每次拉多少
	BatchSize = 50
)

type Worker struct {
	db   *pkgmysql.DB
	rdb  *pkgredis.Client
	tick time.Duration
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds | log.Lshortfile)
	log.Println("🚀 outbox-worker 启动")

	cfg := config.Load()
	mysqlDB, err := connectDB(cfg)
	if err != nil {
		log.Fatalf("MySQL 失败: %v", err)
	}
	defer mysqlDB.Close()

	rdb, err := pkgredis.NewClient(cfg.Redis)
	if err != nil {
		log.Fatalf("Redis 失败: %v", err)
	}
	defer rdb.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	w := &Worker{
		db:   mysqlDB,
		rdb:  rdb,
		tick: 500 * time.Millisecond,
	}

	// 优雅退出
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-quit
		log.Println("收到退出信号, 停止消费")
		cancel()
	}()

	if err := w.ensureConsumerGroup(ctx); err != nil {
		log.Printf("创建消费者组失败: %v (继续运行)", err)
	}

	w.run(ctx)
	log.Println("outbox-worker 已退出")
}

func (w *Worker) ensureConsumerGroup(ctx context.Context) error {
	exists, err := w.rdb.XGroupExists(ctx, EventStreamName, ConsumerGroup)
	if err != nil {
		return err
	}
	if !exists {
		if err := w.rdb.XGroupCreateMkStream(ctx, EventStreamName, ConsumerGroup, "$"); err != nil {
			return err
		}
		log.Printf("✅ 创建消费者组 %s @ %s", ConsumerGroup, EventStreamName)
	}
	return nil
}

func (w *Worker) run(ctx context.Context) {
	ticker := time.NewTicker(w.tick)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.tickOnce(ctx); err != nil {
				log.Printf("tick 处理失败: %v", err)
			}
		}
	}
}

func (w *Worker) tickOnce(ctx context.Context) error {
	// 拉 pending 事件(status=0, 按 created_at 升序)
	type Row struct {
		ID          uint64
		Aggregate   string
		AggregateID uint64
		EventType   string
		Payload     []byte
		RetryCount  int
	}
	var rows []Row
	err := w.db.WithContext(ctx).Raw(`
        SELECT id, aggregate, aggregate_id, event_type, payload, retry_count
          FROM outbox_events
         WHERE status = 0
         ORDER BY id ASC
         LIMIT ?
    `, BatchSize).Scan(&rows).Error
	if err != nil {
		return err
	}

	for _, r := range rows {
		if err := w.handle(ctx, r); err != nil {
			log.Printf("事件 %d 处理失败: %v (retry=%d)", r.ID, err, r.RetryCount)
			w.markRetryOrFailed(ctx, r.ID, r.RetryCount, err.Error())
			continue
		}
		w.markProcessed(ctx, r.ID)
	}

	// 同时: 把刚才 XADD 的事件"投递"出去给真正的消费者
	// 这一步其实是另一个组件的责任(比如 WebSocket fanout 服务)
	// 这里只演示 Stream 写入, 不做实际投递
	return nil
}

func (w *Worker) handle(ctx context.Context, r struct {
	ID          uint64
	Aggregate   string
	AggregateID uint64
	EventType   string
	Payload     []byte
	RetryCount  int
}) error {
	// 1) 投递到 Redis Stream (下游消费者: WebSocket / 通知 / BI)
	values := map[string]interface{}{
		"event_type":   r.EventType,
		"aggregate":    r.Aggregate,
		"aggregate_id": r.AggregateID,
		"payload":      string(r.Payload),
		"ts":           time.Now().Unix(),
	}
	_, err := w.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: EventStreamName,
		Values: values,
		MaxLen: 100000, // 最多保留 10w 条, 超过按 ~ 截断
		Approx: true,
	})
	if err != nil {
		return err
	}

	// 2) 处理已知类型: order.created → 清购物车 / 通知
	switch r.EventType {
	case service.EventOrderCreated:
		var evt service.OrderCreatedEvent
		if err := json.Unmarshal(r.Payload, &evt); err != nil {
			return err
		}
		log.Printf("📦 订单创建 order=%s user=%d amount=%.2f", evt.OrderNumber, evt.UserID, evt.Amount)
		// 通知: 当前没接入 IM/SMS, 留作扩展
	case service.EventOrderRefunded:
		var evt service.OrderRefundedEvent
		if err := json.Unmarshal(r.Payload, &evt); err != nil {
			return err
		}
		log.Printf("💸 订单退款 order=%s user=%d", evt.OrderNumber, evt.UserID)
	case service.EventOrderCancelled:
		var evt service.OrderCancelledEvent
		if err := json.Unmarshal(r.Payload, &evt); err != nil {
			return err
		}
		log.Printf("❌ 订单取消 order=%d user=%d", evt.OrderID, evt.UserID)
	}

	return nil
}

func (w *Worker) markProcessed(ctx context.Context, id uint64) {
	if err := w.db.WithContext(ctx).Exec(
		`UPDATE outbox_events SET status = 1, processed_at = NOW(3) WHERE id = ?`,
		id,
	).Error; err != nil {
		log.Printf("标记 processed 失败 id=%d: %v", id, err)
	}
}

func (w *Worker) markRetryOrFailed(ctx context.Context, id uint64, retry int, lastErr string) {
	status := 0
	if retry+1 >= MaxRetry {
		status = 2 // failed
	}
	if err := w.db.WithContext(ctx).Exec(`
        UPDATE outbox_events
           SET retry_count = retry_count + 1,
               last_error  = ?,
               status      = ?
         WHERE id = ?
    `, truncate(lastErr, 500), status, id).Error; err != nil {
		log.Printf("标记 retry 失败 id=%d: %v", id, err)
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func connectDB(cfg *config.Config) (*pkgmysql.DB, error) {
	return pkgmysql.InitWithRetry(cfg.MySQL, 30)
}