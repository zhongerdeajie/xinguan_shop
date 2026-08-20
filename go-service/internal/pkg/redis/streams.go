// streams.go - Redis Streams 包装
//
// 给 pkgredis.Client 加 XADD / XREAD / XGROUP 等 Stream API
// 供 outbox-worker / WebSocket fanout / 通知服务 使用
package redis

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// XAddArgs Stream 写入参数(避免 import 大写字母开头的 redis 别名)
type XAddArgs = redis.XAddArgs

// XAdd 向流写入一条记录
func (c *Client) XAdd(ctx context.Context, args *XAddArgs) (string, error) {
	return c.Client.XAdd(ctx, args).Result()
}

// XGroupCreateMkStream 创建消费者组(若流不存在则自动建)
func (c *Client) XGroupCreateMkStream(ctx context.Context, stream, group, start string) error {
	return c.Client.XGroupCreateMkStream(ctx, stream, group, start).Err()
}

// XGroupExists 判断消费者组是否存在
//
// go-redis v9 没有直接的 XGroupExists, 用 XInfoGroups 判断
func (c *Client) XGroupExists(ctx context.Context, stream, group string) (bool, error) {
	groups, err := c.Client.XInfoGroups(ctx, stream).Result()
	if err != nil {
		// 流不存在时返回空, 当作不存在
		if err == redis.Nil {
			return false, nil
		}
		return false, err
	}
	for _, g := range groups {
		if g.Name == group {
			return true, nil
		}
	}
	return false, nil
}

// XReadGroup 消费者组读取
func (c *Client) XReadGroup(ctx context.Context, a *redis.XReadGroupArgs) *redis.XStreamSliceCmd {
	return c.Client.XReadGroup(ctx, a)
}

// XAck 确认一条消息处理完成
func (c *Client) XAck(ctx context.Context, stream, group, id string) error {
	return c.Client.XAck(ctx, stream, group, id).Err()
}

// XLen 流当前长度
func (c *Client) XLen(ctx context.Context, stream string) (int64, error) {
	return c.Client.XLen(ctx, stream).Result()
}

// XRange 范围查询
func (c *Client) XRange(ctx context.Context, stream, start, stop string) *redis.XMessageSliceCmd {
	return c.Client.XRange(ctx, stream, start, stop)
}

// HealthQuick 1 秒超时健康检查(供 worker 周期调用)
func (c *Client) HealthQuick(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 1*time.Second)
	defer cancel()
	return c.Ping(ctx).Err()
}

// 避免 "imported and not used"
var _ = redis.Nil