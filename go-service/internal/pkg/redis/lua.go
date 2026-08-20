// Package redis 提供库存相关的 Lua 脚本包装器
//
// 三个脚本(pre_deduct / confirm_stock / release_stock)以原子方式完成
// Redis 侧的库存预扣/确认/释放操作。配合 dish.stock + 乐观锁实现最终一致。
//
// 设计目标:
//   - 单次脚本操作完成"读 - 校验 - 改 - 记录"链路, 避免客户端多次 RTT
//   - 任何失败(脚本内部 fail)都能让 stock 恢复到扣减前
//   - pending 集合天然幂等:同一个 order_no 多次 confirm 是安全的
package redis

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

//go:embed lua/pre_deduct.lua
var preDeductSrc string

//go:embed lua/confirm_stock.lua
var confirmStockSrc string

//go:embed lua/release_stock.lua
var releaseStockSrc string

//go:embed lua/recover_pending.lua
var recoverPendingSrc string

// StockResult 预扣结果码
const (
	StockOK          = 0   // 成功,返回值>=0
	StockErrInput    = -1  // 参数不合法
	StockErrInsufficient = -2  // 库存不足
)

var (
	preDeductScript     = redis.NewScript(preDeductSrc)
	confirmStockScript  = redis.NewScript(confirmStockSrc)
	releaseStockScript  = redis.NewScript(releaseStockSrc)
	recoverPendingScript = redis.NewScript(recoverPendingSrc)

	ErrStockInsufficient = errors.New("库存不足")
	ErrInvalidArgument   = errors.New("参数不合法")
	ErrStockKeyMissing   = errors.New("stock key 缺失且 init_value 不足")
)

// StockKeys Redis key 命名规范
type StockKeys struct {
	Stock    string // dish:{id}:stock
	Pending  string // pending:order
}

// DefaultKeys 构造标准 keys
func DefaultKeys(dishID int64) StockKeys {
	return StockKeys{
		Stock:   fmt.Sprintf("dish:%d:stock", dishID),
		Pending: "pending:order",
	}
}

// PreDeductStock 原子预扣
//
// 调用场景:
//   - 用户提交订单, 商品维度预扣库存
//   - 必须在 MySQL 事务前调用(成功才能进事务)
//
// 调用方责任:
//   - 拿到返回剩余 >= 0 后, defer/finally 必须保证失败路径调用 ReleaseStock
//   - 成功提交后调用 ConfirmStock 清 pending(异步)
//
// 错误码:
//   - ErrStockInsufficient: 库存不足
//   - ErrInvalidArgument:   number <= 0
func (c *Client) PreDeductStock(ctx context.Context, dishID int64, number int, orderNo string, initValue int) (int64, error) {
	keys := DefaultKeys(dishID)
	nowTS := time.Now().Unix() // Go 层传时间戳, Lua 里不能用 redis.call('TIME')
	res, err := preDeductScript.Run(
		ctx, c.Client,
		[]string{keys.Stock, keys.Pending},
		number, orderNo, initValue, nowTS,
	).Int64()
	if err != nil {
		return 0, fmt.Errorf("pre_deduct 脚本执行失败: %w", err)
	}
	switch res {
	case StockErrInput:
		return 0, ErrInvalidArgument
	case StockErrInsufficient:
		return 0, ErrStockInsufficient
	default:
		return res, nil
	}
}

// ConfirmStock 提交成功:清除 pending 标记
func (c *Client) ConfirmStock(ctx context.Context, orderNo string) error {
	_, err := confirmStockScript.Run(
		ctx, c.Client,
		[]string{"pending:order"},
		orderNo,
	).Int64()
	if err != nil {
		return fmt.Errorf("confirm_stock 脚本执行失败: %w", err)
	}
	return nil
}

// ReleaseStock 释放预占:从 pending 反查 stock_key 并 IncrBy
//
// 用于:
//   - 提交订单失败回滚
//   - 用户主动取消订单
//   - 超时未支付的订单
func (c *Client) ReleaseStock(ctx context.Context, orderNo string) (int64, error) {
	res, err := releaseStockScript.Run(
		ctx, c.Client,
		[]string{"pending:order"},
		orderNo,
	).Int64()
	if err != nil {
		return 0, fmt.Errorf("release_stock 脚本执行失败: %w", err)
	}
	return res, nil
}

// RecoverExpiredPending 释放超时未确认的 pending 预占
//
// 由 outbox-worker 定时调用(每 5 分钟), 只释放超过 maxAge 秒的订单。
// 正在处理中的订单(未超时)不受影响。
//
// 参数:
//   - maxAgeSeconds: 超时阈值, 默认 1800(30 分钟)
//
// 返回值: 释放的库存条目数
func (c *Client) RecoverExpiredPending(ctx context.Context, maxAgeSeconds int) (int64, error) {
	if maxAgeSeconds <= 0 {
		maxAgeSeconds = 1800
	}
	nowTS := time.Now().Unix()
	res, err := recoverPendingScript.Run(
		ctx, c.Client,
		[]string{"pending:order"},
		maxAgeSeconds, nowTS,
	).Int64()
	if err != nil {
		return 0, fmt.Errorf("recover_pending 脚本执行失败: %w", err)
	}
	return res, nil
}

// IsNoSuchKey redis 调用返回的"key 不存在"判断
func IsNoSuchKey(err error) bool {
	return errors.Is(err, redis.Nil)
}

// HealthCheck 健康检查
func (c *Client) HealthCheck(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return c.Ping(ctx).Err()
}