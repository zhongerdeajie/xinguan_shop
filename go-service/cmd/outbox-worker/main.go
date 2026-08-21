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
	"fmt"
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
	"gorm.io/gorm"
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
	// 独立的 pending 超时清理 ticker(每 5 分钟)
	// 释放超过 30 分钟未确认的预占库存(订单超时未支付/ConfirmStock 失败残留)
	recoverTicker := time.NewTicker(5 * time.Minute)
	defer recoverTicker.Stop()
	// 库存预留超时释放 ticker(每 2 分钟)
	// 释放下单但 30 分钟未支付导致的库存占用(回补 MySQL + Redis)
	reservationTicker := time.NewTicker(2 * time.Minute)
	defer reservationTicker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.tickOnce(ctx); err != nil {
				log.Printf("tick 处理失败: %v", err)
			}
		case <-recoverTicker.C:
			if err := w.recoverExpiredPending(ctx); err != nil {
				log.Printf("recoverExpiredPending 失败: %v", err)
			}
		case <-reservationTicker.C:
			if err := w.releaseExpiredReservations(ctx); err != nil {
				log.Printf("releaseExpiredReservations 失败: %v", err)
			}
		}
	}
}

// releaseExpiredReservations 释放超时未支付的库存预留
//
// 场景: 用户下单后 30 分钟未支付(订单 status=1 待付款), 已扣的库存被占用
// 处理: 对 status=1 且 expires_at 过期且订单未支付的预留记录:
//   1) 回补 MySQL dish.stock (+quantity, version+1)
//   2) 回补 Redis dish:{id}:stock
//   3) 预留记录置 status=2(已释放)
// 用事务保证一致性
func (w *Worker) releaseExpiredReservations(ctx context.Context) error {
	// 查超时且关联订单未支付的预留(join orders 拿支付状态)
	type Row struct {
		ID        int64
		OrderID   int64
		DishID    int
		Quantity  int
		OrderNo   string
	}
	var rows []Row
	if err := w.db.WithContext(ctx).Raw(`
        SELECT ir.id, ir.order_id, ir.dish_id, ir.quantity, o.number AS order_no
          FROM inventory_reservation ir
          JOIN orders o ON ir.order_id = o.id
         WHERE ir.status = 1
           AND ir.expires_at < NOW(3)
           AND o.pay_status = 0   -- 未支付才释放(已支付不能动)
        LIMIT 100
    `).Scan(&rows).Error; err != nil {
		return fmt.Errorf("查超时预留失败: %w", err)
	}
	if len(rows) == 0 {
		return nil
	}

	released := 0
	for _, r := range rows {
		err := w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			// 1. 回补 MySQL 库存(乐观锁 version+1)
			res := tx.Exec(`
                UPDATE dish
                   SET stock = stock + ?, version = version + 1
                 WHERE id = ?
            `, r.Quantity, r.DishID)
			if res.Error != nil {
				return res.Error
			}
			// 2. 预留记录置为已释放(幂等: 只更新 status=1 的)
			res = tx.Exec(`
                UPDATE inventory_reservation
                   SET status = 2, updated_at = NOW(3)
                 WHERE id = ? AND status = 1
            `, r.ID)
			if res.Error != nil {
				return res.Error
			}
			return nil
		})
		if err != nil {
			log.Printf("[WARN] 释放预留失败 id=%d dish=%d err=%v", r.ID, r.DishID, err)
			continue
		}
		// 3. 回补 Redis 库存
		stockKey := fmt.Sprintf("dish:%d:stock", r.DishID)
		if _, err := w.rdb.IncrBy(ctx, stockKey, int64(r.Quantity)).Result(); err != nil {
			log.Printf("[WARN] 回补 Redis 库存失败 dish=%d err=%v", r.DishID, err)
		}
		log.Printf("⏰ 释放超时预留: order=%s dish=%d qty=%d", r.OrderNo, r.DishID, r.Quantity)
		released++
	}
	if released > 0 {
		log.Printf("本次释放 %d 条超时未支付库存预留", released)
	}
	return nil
}

// recoverExpiredPending 释放超时未确认的预占库存
func (w *Worker) recoverExpiredPending(ctx context.Context) error {
	released, err := w.rdb.RecoverExpiredPending(ctx, 1800) // 30 分钟
	if err != nil {
		return err
	}
	if released > 0 {
		log.Printf("⏰ 释放 %d 条超时未确认的预占库存", released)
	}
	return nil
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
	// 1) 投递到 Redis Stream (持久化事件日志)
	//    用途: 审计 / 重放 / 未来 BI 分析
	//    实时推送走 Redis Pub/Sub(order:new 频道, 见 order_service_v2.go)
	//    Stream 与 Pub/Sub 职责分离: Stream 持久化, Pub/Sub 实时
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