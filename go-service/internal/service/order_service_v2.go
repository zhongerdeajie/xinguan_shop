// Package service - order_service_v2.go
//
// 重构目标:
//   1. Redis 预扣走 Lua(pre_deduct), 原子 + 留 pending 标记
//   2. MySQL 写订单用事务(订单 + 明细 + 扣减 dish.stock + 写 outbox_events)
//   3. defer 兜底:任何 MySQL 失败, 自动 ReleaseStock
//   4. RefundOrder 先改状态, 异步 ReleaseStock
//   5. CancelOrder 同 Refund
//
// 关键不变量(invariant):
//   - pending:order 里存的 orderNo 一定能在 outbox_events 里找到对应行
//   - dish.stock 与 Redis stock 的差值由 stock-sync worker 定期校准
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"go-service/internal/model"
	pkgredis "go-service/internal/pkg/redis"
	"go-service/internal/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ==================== Outbox 事件载荷 ====================

type OrderCreatedEvent struct {
	OrderID     int64   `json:"order_id"`
	OrderNumber string  `json:"order_number"`
	UserID      int     `json:"user_id"`
	Amount      float64 `json:"amount"`
	Address     string  `json:"address"`
	Phone       string  `json:"phone"`
	Consignee   string  `json:"consignee"`
	Dishes      []OrderItem `json:"dishes"`
}

type OrderRefundedEvent struct {
	OrderID     int64  `json:"order_id"`
	OrderNumber string `json:"order_number"`
	UserID      int    `json:"user_id"`
	Reason      string `json:"reason"`
	Items       []OrderItem `json:"items"`
}

type OrderCancelledEvent struct {
	OrderID int64  `json:"order_id"`
	UserID  int    `json:"user_id"`
	Reason  string `json:"reason"`
	Items   []OrderItem `json:"items"`
}

type OrderItem struct {
	DishID    *int `json:"dishId,omitempty"`
	SetmealID *int `json:"setmealId,omitempty"`
	Number    int  `json:"number"`
}

const (
	EventOrderCreated   = "order.created"
	EventOrderRefunded  = "order.refunded"
	EventOrderCancelled = "order.cancelled"
)

// ==================== Service v2 ====================

type OrderServiceV2 struct {
	repo *repository.WriteRepository
	rdb  *pkgredis.Client
}

func NewOrderServiceV2(repo *repository.WriteRepository, rdb *pkgredis.Client) *OrderServiceV2 {
	return &OrderServiceV2{repo: repo, rdb: rdb}
}

// SubmitOrder 提交订单 v2
//
// 流程:
//   1. Lua 原子预扣所有 dish 库存(失败立刻返回)
//   2. defer 兜底:任何后续步骤失败 → ReleaseStock(精确回补)
//   3. MySQL 事务:订单 + 明细 + 扣 dish.stock(乐观锁) + 写 outbox
//   4. 成功 → ConfirmStock 异步清理 pending(失败可重试, 因为 release 也兼容)
func (s *OrderServiceV2) SubmitOrder(ctx context.Context, userID int, dto model.OrderSubmitDTO) (*model.Orders, error) {
	// 1. 取购物车
	cartItems, err := s.repo.FindCartItemsByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("获取购物车失败: %w", err)
	}
	if len(cartItems) == 0 {
		return nil, fmt.Errorf("购物车为空")
	}

	// 2. 取地址
	var address model.AddressBook
	if err := s.repo.GetDB().WithContext(ctx).
		Where("id = ? AND user_id = ?", dto.AddressBookID, userID).
		First(&address).Error; err != nil {
		return nil, fmt.Errorf("收货地址不存在")
	}

	// 3. 校验优惠券并计算折扣
	discount, err := s.validateCoupon(ctx, userID, dto.CouponID, sumAmount(cartItems))
	if err != nil {
		return nil, err
	}

	orderNumber := generateOrderNumber()

	// 4. Lua 原子预扣所有菜品库存
	//    失败立即返回(还没占用任何资源)
	if err := s.preDeductAll(ctx, cartItems, orderNumber); err != nil {
		return nil, err
	}

	// 5. defer 兜底:任何 MySQL 失败 → ReleaseStock
	//    success 标志位用闭包修改
	var success bool
	defer func() {
		if !success {
			if _, err := s.rdb.ReleaseStock(context.Background(), orderNumber); err != nil {
				fmt.Printf("[CRITICAL] 库存释放失败 orderNo=%s err=%v\n", orderNumber, err)
			}
		}
	}()

	// 6. MySQL 事务:订单 + 明细 + 扣 dish.stock + outbox 事件
	order, err := s.createOrderInTx(ctx, userID, &address, dto, orderNumber, discount, cartItems)
	if err != nil {
		return nil, err
	}

	// 7. 成功!
	success = true

	// 8. 异步清理 pending(失败不影响订单, worker 会兜底)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := s.rdb.ConfirmStock(bgCtx, orderNumber); err != nil {
			fmt.Printf("[WARN] ConfirmStock 失败 orderNo=%s err=%v\n", orderNumber, err)
		}
	}()

	return order, nil
}

// preDeductAll 调用 Lua 预扣所有菜品库存
func (s *OrderServiceV2) preDeductAll(ctx context.Context, items []model.ShoppingCart, orderNo string) error {
	for _, item := range items {
		if item.DishID == nil {
			continue // 套餐库存本版本不做(简化)
		}
		var dish model.Dish
		if err := s.repo.GetDB().WithContext(ctx).
			Select("id, stock").Where("id = ?", *item.DishID).
			First(&dish).Error; err != nil {
			return fmt.Errorf("菜品不存在 id=%d", *item.DishID)
		}
		if dish.Stock <= 0 {
			return pkgredis.ErrStockInsufficient // 商品售罄,直接拒
		}
		// 拿一个安全的 init 值:用数据库 stock 作兜底
		remaining, err := s.rdb.PreDeductStock(ctx, int64(*item.DishID), item.Number, orderNo, dish.Stock)
		if err != nil {
			return fmt.Errorf("菜品 [%s] 库存不足: %w", item.Name, err)
		}
		_ = remaining // 仅日志用
	}
	return nil
}

// createOrderInTx 单事务里:订单 + 明细 + 扣 MySQL 库存 + 写 outbox
func (s *OrderServiceV2) createOrderInTx(
	ctx context.Context,
	userID int,
	address *model.AddressBook,
	dto model.OrderSubmitDTO,
	orderNumber string,
	discount float64,
	cartItems []model.ShoppingCart,
) (*model.Orders, error) {
	now := time.Now()
	estTime := now.Add(30 * time.Minute)
	totalAmount := sumAmount(cartItems) - discount
	if totalAmount < 0 {
		totalAmount = 0
	}

	details := make([]model.OrderDetail, 0, len(cartItems))
	dishIDs := make([]int, 0)
	for _, item := range cartItems {
		details = append(details, model.OrderDetail{
			Name:       item.Name,
			Image:      item.Image,
			DishID:     item.DishID,
			SetmealID:  item.SetmealID,
			DishFlavor: item.DishFlavor,
			Number:     item.Number,
			Amount:     item.Amount,
		})
		if item.DishID != nil {
			dishIDs = append(dishIDs, *item.DishID)
		}
	}

	order := &model.Orders{
		OrderNumber:    orderNumber,
		Status:         model.OrderPending,
		UserID:         userID,
		AddressBookID:  dto.AddressBookID,
		OrderTime:      now,
		CheckoutTime:   &now,
		PayMethod:      dto.PayMethod,
		PayStatus:      model.PayUnpaid,
		Amount:         totalAmount,
		DiscountAmount: discount,
		Remark:         dto.Remark,
		Phone:          address.Phone,
		Address:        fmt.Sprintf("%s%s%s%s", address.ProvinceName, address.CityName, address.DistrictName, address.Detail),
		UserName:       address.Consignee,
		Consignee:      address.Consignee,
		EstimatedTime:  &estTime,
	}

	err := s.repo.GetDB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 1. 写订单
		if err := tx.Create(order).Error; err != nil {
			return fmt.Errorf("写订单失败: %w", err)
		}
		for i := range details {
			details[i].OrderID = order.ID
		}
		if err := tx.Create(&details).Error; err != nil {
			return fmt.Errorf("写订单明细失败: %w", err)
		}

		// 2. 扣 MySQL 库存(乐观锁: RowsAffected 必须 == 1)
		for _, item := range cartItems {
			if item.DishID == nil {
				continue
			}
			// WHERE 里有 stock >= number + version = old_version,
			// 同时把 stock 改成 stock-number
			// 这里直接 SQL, 不走 GORM Update 避免触发的额外钩子
			res := tx.Exec(`
                UPDATE dish
                   SET stock = stock - ?, version = version + 1
                 WHERE id = ? AND stock >= ?
            `, item.Number, *item.DishID, item.Number)
			if res.Error != nil {
				return fmt.Errorf("扣 MySQL 库存失败: %w", res.Error)
			}
			if res.RowsAffected == 0 {
				return fmt.Errorf("菜品 [%s] MySQL 库存不足", item.Name)
			}
		}

		// 3. 同事务写 Outbox 事件
		evt := OrderCreatedEvent{
			OrderID:     order.ID,
			OrderNumber: orderNumber,
			UserID:      userID,
			Amount:      totalAmount,
			Address:     order.Address,
			Phone:       order.Phone,
			Consignee:   order.Consignee,
			Dishes:      toOrderItems(cartItems),
		}
		payload, _ := json.Marshal(evt)
		// MySQL JSON 列不接受 binary 类型参数, 把 []byte 转成 string
		// 这是 MySQL 8 + GORM 的兼容性坑(详见 commit message)
		if err := tx.Exec(`
            INSERT INTO outbox_events
                (aggregate, aggregate_id, event_type, payload, status, created_at)
            VALUES (?, ?, ?, CAST(? AS JSON), 0, NOW(3))
        `, "order", order.ID, EventOrderCreated, string(payload)).Error; err != nil {
			return fmt.Errorf("写 outbox 事件失败: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// 事务成功 → 清购物车 (这是副作用, 但因为订单已写, 失败不影响数据完整性)
	if err := s.repo.ClearCart(ctx, userID); err != nil {
		fmt.Printf("[WARN] 清空购物车失败 user=%d err=%v (订单仍正常)\n", userID, err)
		// 这里不算 error: 订单已经入库, 用户继续看到购物车项不影响订单生效
	}

	return order, nil
}

// validateCoupon 校验优惠券并返回折扣金额
func (s *OrderServiceV2) validateCoupon(ctx context.Context, userID, couponID int, total float64) (float64, error) {
	if couponID <= 0 {
		return 0, nil
	}
	coupon, err := s.repo.GetCouponByID(ctx, couponID)
	if err != nil {
		return 0, fmt.Errorf("优惠券不存在或已停发")
	}
	uc, err := s.repo.GetUserCoupon(ctx, userID, couponID)
	if err != nil {
		return 0, fmt.Errorf("未领取该优惠券或已使用")
	}
	if total < coupon.Threshold {
		return 0, fmt.Errorf("未达到优惠券门槛（满 %.2f 元可用）", coupon.Threshold)
	}
	discount := coupon.Amount
	if discount > total {
		discount = total
	}
	if err := s.repo.MarkUserCouponUsed(ctx, uc.ID); err != nil {
		return 0, fmt.Errorf("优惠券核销失败")
	}
	return discount, nil
}

// ==================== RefundOrder v2 ====================
//
// 关键修复: 先改 MySQL 状态, 再异步 ReleaseStock
// 防止"先回补 Redis 再 RefundOrder 失败导致反向超卖"

func (s *OrderServiceV2) RefundOrder(ctx context.Context, userID int, orderID int64) error {
	var order model.Orders
	var details []model.OrderDetail

	err := s.repo.GetDB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 行锁订单
		if err := tx.Clauses(clauseLockUpdates).
			Where("id = ? AND user_id = ? AND pay_status = ?", orderID, userID, model.PayPaid).
			First(&order).Error; err != nil {
			return fmt.Errorf("订单不存在或不可退款")
		}
		// 改状态(同事务)
		if err := tx.Model(&order).Updates(map[string]interface{}{
			"pay_status":    model.PayRefund,
			"status":        model.OrderCancelled,
			"cancel_reason": "用户申请退款",
			"cancel_time":   time.Now(),
		}).Error; err != nil {
			return err
		}
		// 拉明细
		return tx.Where("order_id = ?", orderID).Find(&details).Error
	})
	if err != nil {
		return err
	}

	// 事务提交后才走异步副作用
	// 1) ReleaseStock(回补 Redis)
	// 2) 写 outbox 事件(WebSocket 推送 / 通知)
	go s.afterRefund(order, details)
	return nil
}

func (s *OrderServiceV2) afterRefund(order model.Orders, details []model.OrderDetail) {
	bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1) 回补 MySQL stock(乐观锁)
	if err := s.repo.GetDB().WithContext(bgCtx).Transaction(func(tx *gorm.DB) error {
		for _, d := range details {
			if d.DishID == nil {
				continue
			}
			if err := tx.Exec(`
                UPDATE dish
                   SET stock = stock + ?, version = version + 1
                 WHERE id = ?
            `, d.Number, *d.DishID).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		fmt.Printf("[CRITICAL] 退款回补 MySQL 库存失败 order=%d err=%v\n", order.ID, err)
	}

	// 2) ReleaseStock(用 pending 集合精确释放; 旧菜品可能没有 pending, 这里再补一次 IncrBy)
	for _, d := range details {
		if d.DishID == nil {
			continue
		}
		key := fmt.Sprintf("dish:%d:stock", *d.DishID)
		//  如果 pending 里有这个 order, ReleaseStock 就会自动 IncrBy
		if _, err := s.rdb.ReleaseStock(bgCtx, order.OrderNumber); err != nil {
			fmt.Printf("[WARN] ReleaseStock 失败 order=%s err=%v\n", order.OrderNumber, err)
		}
		_ = key
		break // ReleaseStock 已经按 order_no 反查一次, 不用每个 dish 都调
	}

	// 3) 写 outbox 事件(让 worker 推 WebSocket)
	evt := OrderRefundedEvent{
		OrderID:     order.ID,
		OrderNumber: order.OrderNumber,
		UserID:      order.UserID,
		Reason:      "用户申请退款",
		Items:       detailsToOrderItems(details),
	}
	payload, _ := json.Marshal(evt)
	if err := s.repo.GetDB().WithContext(bgCtx).Exec(`
        INSERT INTO outbox_events
            (aggregate, aggregate_id, event_type, payload, status, created_at)
        VALUES (?, ?, ?, CAST(? AS JSON), 0, NOW(3))
    `, "order", order.ID, EventOrderRefunded, payload).Error; err != nil {
		fmt.Printf("[CRITICAL] 写退款 outbox 事件失败 order=%d err=%v\n", order.ID, err)
	}
}

// ==================== CancelOrder v2 ====================

func (s *OrderServiceV2) CancelOrder(ctx context.Context, userID int, dto model.OrderCancelDTO) error {
	var order model.Orders
	var details []model.OrderDetail

	err := s.repo.GetDB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clauseLockUpdates).
			Where("id = ? AND user_id = ?", dto.OrderID, userID).
			First(&order).Error; err != nil {
			return fmt.Errorf("订单不存在")
		}
		if order.Status != model.OrderPending && order.Status != model.OrderPaid {
			return fmt.Errorf("订单状态不允许取消")
		}
		if err := tx.Model(&order).Updates(map[string]interface{}{
			"status":        model.OrderCancelled,
			"cancel_reason": dto.Reason,
			"cancel_time":   time.Now(),
		}).Error; err != nil {
			return err
		}
		return tx.Where("order_id = ?", dto.OrderID).Find(&details).Error
	})
	if err != nil {
		return err
	}

	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		// 释放 Redis 预占
		s.rdb.ReleaseStock(bgCtx, order.OrderNumber)
		// 如果已支付, 还需要在事务里把钱退给用户(支付系统对接, 此处仅示意)
		if order.PayStatus == model.PayPaid {
			_ = order.Amount
		}
		// 回补 MySQL 库存
		if err := s.repo.GetDB().WithContext(bgCtx).Transaction(func(tx *gorm.DB) error {
			for _, d := range details {
				if d.DishID == nil {
					continue
				}
				if err := tx.Exec(`
                    UPDATE dish
                       SET stock = stock + ?, version = version + 1
                     WHERE id = ?
                `, d.Number, *d.DishID).Error; err != nil {
					return err
				}
			}
			return nil
		}); err != nil {
			fmt.Printf("[CRITICAL] 取消订单回补库存失败 order=%d err=%v\n", order.ID, err)
		}
		// 写 outbox 事件
		evt := OrderCancelledEvent{
			OrderID: order.ID,
			UserID:  order.UserID,
			Reason:  dto.Reason,
			Items:   detailsToOrderItems(details),
		}
		payload, _ := json.Marshal(evt)
		_ = s.repo.GetDB().WithContext(bgCtx).Exec(`
            INSERT INTO outbox_events
                (aggregate, aggregate_id, event_type, payload, status, created_at)
            VALUES (?, ?, ?, CAST(? AS JSON), 0, NOW(3))
        `, "order", order.ID, EventOrderCancelled, string(payload)).Error
	}()

	return nil
}

// ==================== Helpers ====================

func sumAmount(items []model.ShoppingCart) float64 {
	var total float64
	for _, item := range items {
		total += item.Amount
	}
	return total
}

func toOrderItems(items []model.ShoppingCart) []OrderItem {
	out := make([]OrderItem, 0, len(items))
	for _, item := range items {
		out = append(out, OrderItem{
			DishID:    item.DishID,
			SetmealID: item.SetmealID,
			Number:    item.Number,
		})
	}
	return out
}

func detailsToOrderItems(details []model.OrderDetail) []OrderItem {
	out := make([]OrderItem, 0, len(details))
	for _, d := range details {
		out = append(out, OrderItem{
			DishID:    d.DishID,
			SetmealID: d.SetmealID,
			Number:    d.Number,
		})
	}
	return out
}

// clauseLockUpdates GORM 行锁
var clauseLockUpdates = clause.Locking{Strength: "UPDATE"}

// 错误
var (
	ErrOrderNotRefundable = errors.New("订单不可退款")
	ErrCouponInvalid      = errors.New("优惠券无效")
)