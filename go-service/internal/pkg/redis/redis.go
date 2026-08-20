package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"go-service/internal/config"
)

type Client struct {
	*redis.Client
}

func NewClient(cfg config.RedisConfig) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:         cfg.Addr,
		Password:     cfg.Password,
		DB:           cfg.DB,
		PoolSize:     100,             // 连接池大小
		MinIdleConns: 10,              // 最小空闲连接
		MaxRetries:   3,               // 最大重试次数
		DialTimeout:  5 * time.Second, // 连接超时
		ReadTimeout:  3 * time.Second, // 读取超时
		WriteTimeout: 3 * time.Second, // 写入超时
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("Redis 连接失败: %w", err)
	}
	return &Client{rdb}, nil
}

// ==========================================
// Redis 分布式锁（SET NX EX 模式）
// ==========================================

// AcquireLock 获取分布式锁
// 使用 SET key value NX EX timeout 模式
// NX: 仅当 key 不存在时才设置（互斥）
// EX: 设置过期时间（防止死锁）
func (c *Client) AcquireLock(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	// SET key value NX EX timeout
	success, err := c.SetNX(ctx, "lock:"+key, "1", ttl).Result()
	if err != nil {
		return false, err
	}
	return success, nil
}

// ReleaseLock 释放分布式锁
func (c *Client) ReleaseLock(ctx context.Context, key string) error {
	return c.Del(ctx, "lock:"+key).Err()
}

// AcquireLockWithRetry 带重试的分布式锁
func (c *Client) AcquireLockWithRetry(ctx context.Context, key string, ttl time.Duration, retry int) (bool, error) {
	for i := 0; i < retry; i++ {
		locked, err := c.AcquireLock(ctx, key, ttl)
		if err != nil {
			return false, err
		}
		if locked {
			return true, nil
		}
		// 等待一段时间后重试
		time.Sleep(50 * time.Millisecond)
	}
	return false, nil
}

// ==========================================
// 库存预减相关
// ==========================================

// DecrStock 预减库存
func (c *Client) DecrStock(ctx context.Context, key string) (int64, error) {
	return c.Decr(ctx, key).Result()
}

// IncrStock 恢复库存
func (c *Client) IncrStock(ctx context.Context, key string) (int64, error) {
	return c.Incr(ctx, key).Result()
}

// SetStock 设置库存
func (c *Client) SetStock(ctx context.Context, key string, value int64, ttl time.Duration) error {
	return c.Set(ctx, key, value, ttl).Err()
}

// GetStock 获取库存
func (c *Client) GetStock(ctx context.Context, key string) (int64, error) {
	return c.Get(ctx, key).Int64()
}

// ==========================================
// 滑动窗口限流
// ==========================================

// Allow performs an atomic Redis sliding-window check.
func (c *Client) Allow(ctx context.Context, key string, limit int64, window time.Duration) (bool, error) {
	if limit <= 0 || window <= 0 {
		return false, fmt.Errorf("invalid rate limit configuration")
	}

	now := time.Now().UnixMicro()
	cutoff := now - window.Microseconds()
	script := redis.NewScript(`
local key = KEYS[1]
local sequenceKey = key .. ':sequence'
local cutoff = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local window = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
if count >= limit then
    redis.call('EXPIRE', key, window)
    return 0
end
local sequence = redis.call('INCR', sequenceKey)
redis.call('ZADD', key, now, tostring(now) .. ':' .. tostring(sequence))
redis.call('EXPIRE', key, window)
redis.call('EXPIRE', sequenceKey, window)
return 1
`)

	result, err := script.Run(ctx, c.Client, []string{key}, cutoff, now, limit, max(1, int(window.Seconds()))).Int()
	if err != nil {
		return false, err
	}
	return result == 1, nil
}

// DistributedLock 兼容旧接口
func (c *Client) DistributedLock(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	return c.AcquireLock(ctx, key, ttl)
}

// Publish 发布 Pub/Sub 消息(2026-08-20 新增)
// 用于跨服务通知:NestJS OrdersGateway 订阅同 channel, 收到即 broadcastNewOrder
func (c *Client) Publish(ctx context.Context, channel string, payload interface{}) (int64, error) {
	return c.Client.Publish(ctx, channel, payload).Result()
}
