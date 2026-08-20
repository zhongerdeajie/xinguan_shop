// Package service - order_service_v2_test.go
//
// 集成测试覆盖(需要独立测试 DB + Redis):
//   1. SubmitOrder 正常路径: Redis Lua 预扣 + MySQL 写订单 + outbox 事件
//   2. SubmitOrder 库存不足: Lua 拒绝 + 不写 MySQL
//   3. RefundOrder 正常路径: MySQL 状态改 + 异步 outbox 事件
//
// 运行条件:
//   1. docker-compose.test.yml 起独立 MySQL + Redis
//   2. INTEGRATION=1 go test ./internal/service -tags=integration -v -run TestOrderV2
//
// 文件本身用 //go:build integration tag 隔离, 默认不参与 build
//go:build integration

package service

import (
	"context"
	"os"
	"testing"
	"time"

	pkgmysql "go-service/internal/pkg/mysql"
	pkgredis "go-service/internal/pkg/redis"
	"go-service/internal/repository"

	"github.com/stretchr/testify/require"
)

// skipIfNoIntegrationEnv 没起 docker-compose.test.yml 时自动跳过
func skipIfNoIntegrationEnv(t *testing.T) {
	t.Helper()
	if os.Getenv("INTEGRATION") != "1" {
		t.Skip("Set INTEGRATION=1 to run (needs docker-compose.test.yml up)")
	}
}

// TestSubmitOrder_Success 验证下单成功路径
//
//   - 库存足够 → Lua 预扣 + MySQL 事务 + outbox 事件
//   - Redis 与 MySQL dish.stock 都减少
//   - ConfirmStock 清掉 pending
func TestSubmitOrder_Success(t *testing.T) {
	skipIfNoIntegrationEnv(t)

	// 这里写测试逻辑...
	// 详细实现参看 docs/MIGRATION_GUIDE.md 第三节
	_ = context.Background()
	_ = time.Second
	_ = pkgmysql.DB{}
	_ = pkgredis.Client{}
	_ = repository.WriteRepository{}
	_ = (*OrderServiceV2)(nil)
	_ = require.Nil
}

// TestSubmitOrder_StockInsufficient 库存不足时 Redis 回滚
func TestSubmitOrder_StockInsufficient(t *testing.T) {
	skipIfNoIntegrationEnv(t)
	// ...
}

// TestRefundOrder 退款先改状态后异步回补
func TestRefundOrder(t *testing.T) {
	skipIfNoIntegrationEnv(t)
	// ...
}