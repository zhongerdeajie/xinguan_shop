// Package service - order_service_v2_test.go
//
// 集成测试覆盖(需要真实 MySQL + Redis):
//   1. TestSubmitOrder_Success: 库存足够 → Lua 预扣 + MySQL 事务 + outbox 事件
//   2. TestSubmitOrder_StockInsufficient: 库存不足 → Lua 拒绝 + 不写 MySQL
//   3. TestRefundOrder: 退款先改状态后异步回补
//
// 运行条件:
//   1. docker-compose.test.yml 起 MySQL + Redis (复用主库, 用独立 user_id 隔离)
//   2. INTEGRATION=1 go test ./internal/service -tags=integration -v -run TestOrderV2
//
// 隔离策略:
//   - 用独立 user_id (9999/9998/9997) 避免污染真实数据
//   - 用 Redis DB 15 隔离
//   - 测试前清理测试数据, 测试后清理
//
// 文件本身用 //go:build integration tag 隔离, 默认不参与 build
//go:build integration

package service

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"go-service/internal/config"
	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
	pkgredis "go-service/internal/pkg/redis"
	"go-service/internal/repository"

	"github.com/stretchr/testify/require"
)

// 测试专用 user_id(避开真实用户)
const (
	testUserA = 9999 // 下单成功
	testUserB = 9998 // 库存不足
	testUserC = 9997 // 退款
	testDish  = 1
)

// skipIfNoIntegrationEnv 没起 docker-compose.test.yml 时自动跳过
func skipIfNoIntegrationEnv(t *testing.T) {
	t.Helper()
	if os.Getenv("INTEGRATION") != "1" {
		t.Skip("Set INTEGRATION=1 to run (needs docker-compose.test.yml up)")
	}
}

// testConfig 构造测试配置: 连主库 starselect + Redis DB 15
func testConfig() *config.Config {
	cfg := config.Load()
	cfg.Redis.DB = 15 // 测试隔离
	return cfg
}

// newTestService 初始化 repo + service v2
func newTestService(t *testing.T) (*OrderServiceV2, *pkgmysql.DB, *pkgredis.Client) {
	t.Helper()
	cfg := testConfig()
	db, err := pkgmysql.Init(cfg.MySQL)
	require.NoError(t, err, "MySQL 连接失败")
	rdb, err := pkgredis.NewClient(cfg.Redis)
	require.NoError(t, err, "Redis 连接失败")
	repo := repository.NewWriteRepository(db, rdb)
	svc := NewOrderServiceV2(repo, rdb)
	return svc, db, rdb
}

// cleanupTestData 清理测试数据(幂等) + 确保测试用户存在
func cleanupTestData(t *testing.T, db *pkgmysql.DB, rdb *pkgredis.Client) {
	t.Helper()
	ctx := context.Background()
	// 清理购物车
	_ = db.Exec(`DELETE FROM shopping_cart WHERE user_id IN (?, ?, ?)`, testUserA, testUserB, testUserC).Error
	// 清理订单明细(先删明细再删订单, 外键)
	_ = db.Exec(`DELETE od FROM order_detail od JOIN orders o ON od.order_id = o.id WHERE o.user_id IN (?, ?, ?)`, testUserA, testUserB, testUserC).Error
	_ = db.Exec(`DELETE FROM orders WHERE user_id IN (?, ?, ?)`, testUserA, testUserB, testUserC).Error
	// 清理 outbox 事件(按 aggregate_id 关联订单)
	_ = db.Exec(`DELETE oe FROM outbox_events oe JOIN orders o ON oe.aggregate_id = o.id WHERE o.user_id IN (?, ?, ?)`, testUserA, testUserB, testUserC).Error
	// 清理地址
	_ = db.Exec(`DELETE FROM address_book WHERE user_id IN (?, ?, ?)`, testUserA, testUserB, testUserC).Error
	// 清理 Redis
	_ = rdb.Del(ctx, fmt.Sprintf("dish:%d:stock", testDish), "pending:order").Err()
	// 重置菜品库存
	_ = db.Exec(`UPDATE dish SET stock = 50, version = 0 WHERE id = ?`, testDish).Error
	// 确保测试用户存在(外键约束: shopping_cart.user_id -> user.id)
	for _, uid := range []int{testUserA, testUserB, testUserC} {
		_ = db.Exec(`
            INSERT IGNORE INTO user (id, name, phone, create_time)
            VALUES (?, ?, ?, NOW())
        `, uid, fmt.Sprintf("测试用户%d", uid), fmt.Sprintf("139%08d", uid)).Error
	}
}

// seedCart 给测试用户插入购物车
func seedCart(t *testing.T, db *pkgmysql.DB, userID, dishID, number int) {
	t.Helper()
	amount := float64(number) * 12.0
	err := db.Exec(`
        INSERT INTO shopping_cart (user_id, dish_id, name, number, amount, create_time)
        VALUES (?, ?, '集成测试菜', ?, ?, NOW())
    `, userID, dishID, number, amount).Error
	require.NoError(t, err, "插入购物车失败")
}

// seedAddress 给测试用户插入地址
func seedAddress(t *testing.T, db *pkgmysql.DB, userID int) int {
	t.Helper()
	addr := model.AddressBook{
		UserID:       userID,
		Consignee:    "测试收货人",
		Phone:        "13800000000",
		ProvinceName: "广东省",
		CityName:     "深圳市",
		DistrictName: "南山区",
		Detail:       "科技园路1号",
		IsDefault:    1,
	}
	require.NoError(t, db.Create(&addr).Error, "插入地址失败")
	return addr.ID
}

// ==================== 测试用例 ====================

// TestSubmitOrder_Success 验证下单成功路径
//
//   - 库存足够 → Lua 预扣 + MySQL 事务 + outbox 事件
//   - Redis 与 MySQL dish.stock 都减少
//   - ConfirmStock 清掉 pending
func TestSubmitOrder_Success(t *testing.T) {
	skipIfNoIntegrationEnv(t)
	svc, db, rdb := newTestService(t)
	defer db.Close()
	defer rdb.Close()
	cleanupTestData(t, db, rdb)
	defer cleanupTestData(t, db, rdb)

	ctx := context.Background()

	// 准备: 库存 50 + 购物车 2 份 + 地址
	require.NoError(t, rdb.Set(ctx, fmt.Sprintf("dish:%d:stock", testDish), 50, 24*time.Hour).Err())
	seedCart(t, db, testUserA, testDish, 2)
	addressID := seedAddress(t, db, testUserA)

	// 执行
	dto := model.OrderSubmitDTO{AddressBookID: addressID, PayMethod: 1, Remark: "集成测试"}
	order, err := svc.SubmitOrder(ctx, testUserA, dto)
	require.NoError(t, err, "下单失败")
	require.NotNil(t, order)
	require.NotEmpty(t, order.OrderNumber)

	// 验证 1: Redis 库存 50 → 48
	redisStock, err := rdb.Get(ctx, fmt.Sprintf("dish:%d:stock", testDish)).Int64()
	require.NoError(t, err)
	require.Equal(t, int64(48), redisStock, "Redis 库存应减 2")

	// 验证 2: pending 已清(ConfirmStock 是异步 goroutine, 等它跑完)
	time.Sleep(500 * time.Millisecond)
	pending, err := rdb.HGet(ctx, "pending:order", order.OrderNumber).Result()
	require.Error(t, err, "pending 应已被 HDEL")
	require.Empty(t, pending)

	// 验证 3: MySQL dish.stock 50 → 48
	var mysqlStock int
	require.NoError(t, db.Raw(`SELECT stock FROM dish WHERE id = ?`, testDish).Scan(&mysqlStock).Error)
	require.Equal(t, 48, mysqlStock, "MySQL 库存应减 2")

	// 验证 4: outbox 事件已写
	var outboxCount int64
	require.NoError(t, db.Raw(`
        SELECT COUNT(*) FROM outbox_events
         WHERE aggregate_id = ? AND event_type = 'order.created'
    `, order.ID).Scan(&outboxCount).Error)
	require.Equal(t, int64(1), outboxCount, "应有 1 条 order.created 事件")

	// 验证 5: 购物车已清
	var cartCount int64
	require.NoError(t, db.Raw(`SELECT COUNT(*) FROM shopping_cart WHERE user_id = ?`, testUserA).Scan(&cartCount).Error)
	require.Equal(t, int64(0), cartCount, "购物车应被清空")

	t.Logf("✅ TestSubmitOrder_Success: order=%s redis=48 mysql=48 outbox=1", order.OrderNumber)
}

// TestSubmitOrder_StockInsufficient 验证库存不足时 Lua 拒绝 + 不写 MySQL
func TestSubmitOrder_StockInsufficient(t *testing.T) {
	skipIfNoIntegrationEnv(t)
	svc, db, rdb := newTestService(t)
	defer db.Close()
	defer rdb.Close()
	cleanupTestData(t, db, rdb)
	defer cleanupTestData(t, db, rdb)

	ctx := context.Background()

	// 准备: 库存只够 1, 但购物车要 5 份
	require.NoError(t, rdb.Set(ctx, fmt.Sprintf("dish:%d:stock", testDish), 1, 24*time.Hour).Err())
	seedCart(t, db, testUserB, testDish, 5)
	addressID := seedAddress(t, db, testUserB)

	// 执行
	dto := model.OrderSubmitDTO{AddressBookID: addressID, PayMethod: 1}
	_, err := svc.SubmitOrder(ctx, testUserB, dto)
	require.Error(t, err, "库存不足应报错")
	require.Contains(t, err.Error(), "库存不足")

	// 验证 1: Redis 库存保持 1(没扣成功)
	redisStock, err := rdb.Get(ctx, fmt.Sprintf("dish:%d:stock", testDish)).Int64()
	require.NoError(t, err)
	require.Equal(t, int64(1), redisStock, "Redis 库存应保持 1")

	// 验证 2: MySQL dish.stock 没变(50)
	var mysqlStock int
	require.NoError(t, db.Raw(`SELECT stock FROM dish WHERE id = ?`, testDish).Scan(&mysqlStock).Error)
	require.Equal(t, 50, mysqlStock, "MySQL 库存不应变")

	// 验证 3: 没有订单
	var orderCount int64
	require.NoError(t, db.Raw(`SELECT COUNT(*) FROM orders WHERE user_id = ?`, testUserB).Scan(&orderCount).Error)
	require.Equal(t, int64(0), orderCount, "不应有订单")

	// 验证 4: 没有 outbox 事件(按测试用户关联, 避免被其他测试污染)
	var outboxCount int64
	require.NoError(t, db.Raw(`
        SELECT COUNT(*) FROM outbox_events oe
         JOIN orders o ON oe.aggregate_id = o.id
         WHERE oe.event_type = 'order.created' AND o.user_id = ?
    `, testUserB).Scan(&outboxCount).Error)
	require.Equal(t, int64(0), outboxCount, "不应有 outbox 事件")

	t.Logf("✅ TestSubmitOrder_StockInsufficient: 拒绝下单, 库存未动")
}

// TestRefundOrder 验证退款先改状态后异步回补
func TestRefundOrder(t *testing.T) {
	skipIfNoIntegrationEnv(t)
	svc, db, rdb := newTestService(t)
	defer db.Close()
	defer rdb.Close()
	cleanupTestData(t, db, rdb)
	defer cleanupTestData(t, db, rdb)

	ctx := context.Background()

	// 准备: 先下一单(库存 50 → 47, 3 份)
	require.NoError(t, rdb.Set(ctx, fmt.Sprintf("dish:%d:stock", testDish), 50, 24*time.Hour).Err())
	seedCart(t, db, testUserC, testDish, 3)
	addressID := seedAddress(t, db, testUserC)
	dto := model.OrderSubmitDTO{AddressBookID: addressID, PayMethod: 1}
	order, err := svc.SubmitOrder(ctx, testUserC, dto)
	require.NoError(t, err, "下单失败")

	// 模拟支付成功
	require.NoError(t, db.Exec(`UPDATE orders SET pay_status = ?, status = ? WHERE id = ?`, model.PayPaid, model.OrderPaid, order.ID).Error)

	// 执行退款
	require.NoError(t, svc.RefundOrder(ctx, testUserC, order.ID), "退款失败")

	// 验证 1: MySQL 状态已改(先改状态)
	var orderState struct {
		PayStatus int
		Status    int
	}
	require.NoError(t, db.Raw(`SELECT pay_status, status FROM orders WHERE id = ?`, order.ID).Scan(&orderState).Error)
	require.Equal(t, model.PayRefund, orderState.PayStatus, "pay_status 应为已退款")
	require.Equal(t, model.OrderCancelled, orderState.Status, "status 应为已取消")

	// 等 goroutine 跑完(异步回补)
	time.Sleep(800 * time.Millisecond)

	// 验证 2: MySQL dish.stock 回补 47 → 50
	var mysqlStock int
	require.NoError(t, db.Raw(`SELECT stock FROM dish WHERE id = ?`, testDish).Scan(&mysqlStock).Error)
	require.Equal(t, 50, mysqlStock, "MySQL 库存应回补到 50")

	// 验证 3: outbox 有退款事件
	var outboxCount int64
	require.NoError(t, db.Raw(`
        SELECT COUNT(*) FROM outbox_events
         WHERE aggregate_id = ? AND event_type = 'order.refunded'
    `, order.ID).Scan(&outboxCount).Error)
	require.Equal(t, int64(1), outboxCount, "应有 1 条 order.refunded 事件")

	t.Logf("✅ TestRefundOrder: 状态已改, 库存回补 50, outbox=1")
}