package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"go-service/internal/model"
	"go-service/internal/pkg/mysql"
	"go-service/internal/pkg/redis"
	pkgstrutil "go-service/internal/pkg/strutil"
	"gorm.io/gorm"
)

// WriteRepository 写入操作仓库
type WriteRepository struct {
	db  *mysql.DB
	rdb *redis.Client
}

func NewWriteRepository(db *mysql.DB, rdb *redis.Client) *WriteRepository {
	return &WriteRepository{db: db, rdb: rdb}
}

// GetDB 返回底层 GORM 连接（供 Service 层直接使用）
func (r *WriteRepository) GetDB() *mysql.DB {
	return r.db
}

// ==========================================
// 员工写入
// ==========================================
func (r *WriteRepository) CreateEmployee(ctx context.Context, emp *model.Employee) error {
	return r.db.WithContext(ctx).Create(emp).Error
}

func (r *WriteRepository) UpdateEmployee(ctx context.Context, id int, updates map[string]interface{}) error {
	pkgstrutil.NormalizeUpdateMap(updates)
	updates["update_time"] = time.Now()
	return r.db.WithContext(ctx).Model(&model.Employee{}).Where("id = ?", id).Updates(updates).Error
}

func (r *WriteRepository) DeleteEmployee(ctx context.Context, id int) error {
	return r.db.WithContext(ctx).Delete(&model.Employee{}, id).Error
}

// ==========================================
// 菜品写入
// ==========================================
func (r *WriteRepository) CreateDish(ctx context.Context, dish *model.Dish) error {
	return r.db.WithContext(ctx).Create(dish).Error
}

func (r *WriteRepository) UpdateDish(ctx context.Context, id int, updates map[string]interface{}) error {
	pkgstrutil.NormalizeUpdateMap(updates)
	updates["update_time"] = time.Now()
	return r.db.WithContext(ctx).Model(&model.Dish{}).Where("id = ?", id).Updates(updates).Error
}

func (r *WriteRepository) DeleteDish(ctx context.Context, id int) error {
	return r.db.WithContext(ctx).Delete(&model.Dish{}, id).Error
}

// ==========================================
// 套餐写入
// ==========================================
func (r *WriteRepository) CreateSetmeal(ctx context.Context, setmeal *model.Setmeal) error {
	return r.db.WithContext(ctx).Create(setmeal).Error
}

func (r *WriteRepository) UpdateSetmeal(ctx context.Context, id int, updates map[string]interface{}) error {
	pkgstrutil.NormalizeUpdateMap(updates)
	updates["update_time"] = time.Now()
	return r.db.WithContext(ctx).Model(&model.Setmeal{}).Where("id = ?", id).Updates(updates).Error
}

func (r *WriteRepository) DeleteSetmeal(ctx context.Context, id int) error {
	return r.db.WithContext(ctx).Delete(&model.Setmeal{}, id).Error
}

// ==========================================
// 用户(C端)写入
// ==========================================
func (r *WriteRepository) CreateUser(ctx context.Context, user *model.User) error {
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *WriteRepository) UpdateUser(ctx context.Context, id int, updates map[string]interface{}) error {
	pkgstrutil.NormalizeUpdateMap(updates)
	return r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", id).Updates(updates).Error
}

// ==========================================
// 地址簿写入
// ==========================================
func (r *WriteRepository) CreateAddressBook(ctx context.Context, addr *model.AddressBook) error {
	if err := r.db.WithContext(ctx).Create(addr).Error; err != nil {
		return err
	}
	// 地址创建历史(只追加, 用于审计/防历史订单丢地址)
	r.logAddressSnapshot(ctx, addr)
	return nil
}

func (r *WriteRepository) UpdateAddressBook(ctx context.Context, userID, id int, updates map[string]interface{}) error {
	pkgstrutil.NormalizeUpdateMap(updates)
	if err := r.db.WithContext(ctx).Model(&model.AddressBook{}).
		Where("id = ? AND user_id = ?", id, userID).Updates(updates).Error; err != nil {
		return err
	}
	// 记录修改后的完整地址快照
	var addr model.AddressBook
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&addr).Error; err == nil {
		r.logAddressSnapshot(ctx, &addr)
	}
	return nil
}

func (r *WriteRepository) DeleteAddressBook(ctx context.Context, userID, id int) error {
	// 删除前记录地址快照(软删后历史订单仍能查到当时的地址)
	var addr model.AddressBook
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&addr).Error; err == nil {
		r.logAddressSnapshot(ctx, &addr)
	}
	return r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).
		Delete(&model.AddressBook{}).Error
}

// logAddressSnapshot 记录地址快照到 address_log(只追加, 失败不影响主流程)
func (r *WriteRepository) logAddressSnapshot(ctx context.Context, addr *model.AddressBook) {
	snapshot, _ := json.Marshal(addr)
	_ = r.db.WithContext(ctx).Create(&model.AddressLog{
		AddressID: addr.ID,
		UserID:    addr.UserID,
		Snapshot:  string(snapshot),
		CreatedAt: time.Now(),
	}).Error
}

// SetDefaultAddress 设置默认地址（事务）
func (r *WriteRepository) SetDefaultAddress(ctx context.Context, userID, addrID int) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 先将该用户所有地址设为非默认
		if err := tx.Model(&model.AddressBook{}).Where("user_id = ?", userID).
			Update("is_default", 0).Error; err != nil {
			return err
		}
		// 再将目标地址设为默认
		return tx.Model(&model.AddressBook{}).Where("id = ? AND user_id = ?", addrID, userID).
			Update("is_default", 1).Error
	})
}

// ==========================================
// 购物车写入
// ==========================================
// AddToCart 添加购物车项
func (r *WriteRepository) AddToCart(ctx context.Context, cart *model.ShoppingCart) error {
	return r.db.WithContext(ctx).Create(cart).Error
}

// UpdateCartItem 更新购物车项数量
func (r *WriteRepository) UpdateCartItem(ctx context.Context, id int, number int, amount float64) error {
	return r.db.WithContext(ctx).Model(&model.ShoppingCart{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"number": number,
			"amount": amount,
		}).Error
}

// DeleteCartItem 删除当前用户的购物车项
func (r *WriteRepository) DeleteCartItem(ctx context.Context, userID, id int) error {
	return r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).
		Delete(&model.ShoppingCart{}).Error
}

// ClearCart 清空用户购物车
func (r *WriteRepository) ClearCart(ctx context.Context, userID int) error {
	return r.db.WithContext(ctx).Where("user_id = ?", userID).Delete(&model.ShoppingCart{}).Error
}

// FindCartItemByUserAndDish 根据用户和菜品查找购物车项
func (r *WriteRepository) FindCartItemByUserAndDish(ctx context.Context, userID, dishID int) (*model.ShoppingCart, error) {
	var cart model.ShoppingCart
	err := r.db.WithContext(ctx).Where("user_id = ? AND dish_id = ?", userID, dishID).First(&cart).Error
	return &cart, err
}

// FindCartItemsByUserID 获取用户购物车列表
func (r *WriteRepository) FindCartItemsByUserID(ctx context.Context, userID int) ([]model.ShoppingCart, error) {
	var items []model.ShoppingCart
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&items).Error
	return items, err
}

// ==========================================
// 订单写入（高并发 - 使用 Redis 分布式锁）
// ==========================================
// CreateOrder 创建订单
func (r *WriteRepository) CreateOrder(ctx context.Context, order *model.Orders, details []model.OrderDetail) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 插入订单
		if err := tx.Create(order).Error; err != nil {
			return err
		}
		// 插入订单明细
		for i := range details {
			details[i].OrderID = order.ID
		}
		if len(details) > 0 {
			if err := tx.Create(&details).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// UpdateOrderStatus 更新订单状态
func (r *WriteRepository) UpdateOrderStatus(ctx context.Context, orderID int64, status int) error {
	return r.db.WithContext(ctx).Model(&model.Orders{}).Where("id = ?", orderID).
		Updates(map[string]interface{}{
			"status": status,
		}).Error
}

// UpdateOrder 更新订单字段
func (r *WriteRepository) UpdateOrder(ctx context.Context, orderID int64, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).Model(&model.Orders{}).Where("id = ?", orderID).Updates(updates).Error
}

// CancelOrder 取消订单
func (r *WriteRepository) CancelOrder(ctx context.Context, orderID int64, reason string) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&model.Orders{}).Where("id = ?", orderID).
		Updates(map[string]interface{}{
			"status":        model.OrderCancelled,
			"cancel_reason": reason,
			"cancel_time":   now,
		}).Error
}

// PayOrder 订单支付
func (r *WriteRepository) PayOrder(ctx context.Context, orderID int64, payMethod int) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&model.Orders{}).Where("id = ? AND pay_status = ?", orderID, model.PayUnpaid).
		Updates(map[string]interface{}{
			"pay_status":    model.PayPaid,
			"status":        model.OrderPaid,
			"pay_method":    payMethod,
			"checkout_time": now,
		}).Error
}

// RefundOrder 退款：标记订单已取消 + 支付状态为已退款
func (r *WriteRepository) RefundOrder(ctx context.Context, orderID int64, reason string) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&model.Orders{}).Where("id = ? AND pay_status = ?", orderID, model.PayPaid).
		Updates(map[string]interface{}{
			"pay_status":    model.PayRefund,
			"status":        model.OrderCancelled,
			"cancel_reason": reason,
			"cancel_time":   now,
		}).Error
}

// GetCouponByID 获取可用优惠券
func (r *WriteRepository) GetCouponByID(ctx context.Context, id int) (*model.Coupon, error) {
	var coupon model.Coupon
	err := r.db.WithContext(ctx).Where("id = ? AND status = 1", id).First(&coupon).Error
	return &coupon, err
}

// GetUserCoupon 获取用户未使用的优惠券
func (r *WriteRepository) GetUserCoupon(ctx context.Context, userID, couponID int) (*model.UserCoupon, error) {
	var uc model.UserCoupon
	err := r.db.WithContext(ctx).Where("user_id = ? AND coupon_id = ? AND status = 0", userID, couponID).First(&uc).Error
	return &uc, err
}

// MarkUserCouponUsed 核销优惠券
// 核销时同步写 user_coupon_log(USED 动作, 只追加)
func (r *WriteRepository) MarkUserCouponUsed(ctx context.Context, id int) error {
	// 先查原记录(拿 user_id / coupon_id 写日志)
	var uc model.UserCoupon
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&uc).Error; err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Model(&model.UserCoupon{}).Where("id = ?", id).
		Updates(map[string]interface{}{"status": 1, "used_time": time.Now()}).Error; err != nil {
		return err
	}
	// 写券使用流水(失败不影响核销主流程)
	_ = r.db.WithContext(ctx).Create(&model.UserCouponLog{
		UserID:       uc.UserID,
		CouponID:     uc.CouponID,
		UserCouponID: uc.ID,
		Action:       "USED",
		CreatedAt:    time.Now(),
	}).Error
	return nil
}

// GetOrderByID 根据ID获取订单
func (r *WriteRepository) GetOrderByID(ctx context.Context, orderID int64) (*model.Orders, error) {
	var order model.Orders
	err := r.db.WithContext(ctx).Where("id = ?", orderID).First(&order).Error
	return &order, err
}

// GetOrderByNumber 根据订单号获取订单
func (r *WriteRepository) GetOrderByNumber(ctx context.Context, orderNo string) (*model.Orders, error) {
	var order model.Orders
	err := r.db.WithContext(ctx).Where("number = ?", orderNo).First(&order).Error
	return &order, err
}

// GetOrderDetailsByOrderID 获取订单明细
func (r *WriteRepository) GetOrderDetailsByOrderID(ctx context.Context, orderID int64) ([]model.OrderDetail, error) {
	var details []model.OrderDetail
	err := r.db.WithContext(ctx).Where("order_id = ?", orderID).Find(&details).Error
	return details, err
}

// ==========================================
// Redis 缓存同步
// ==========================================
func (r *WriteRepository) InvalidateEmployeeCache(ctx context.Context, employeeID int) error {
	key := fmt.Sprintf("employee:%d", employeeID)
	return r.rdb.Del(ctx, key).Err()
}

func (r *WriteRepository) InvalidateDishCache(ctx context.Context, dishID int) error {
	key := fmt.Sprintf("dish:%d", dishID)
	return r.rdb.Del(ctx, key).Err()
}

func (r *WriteRepository) InvalidateSetmealCache(ctx context.Context, setmealID int) error {
	key := fmt.Sprintf("setmeal:%d", setmealID)
	return r.rdb.Del(ctx, key).Err()
}

// SyncDishStock 同步菜品库存到 Redis（用于秒杀/防超卖）
func (r *WriteRepository) SyncDishStock(ctx context.Context, dishID int, stock int) error {
	key := fmt.Sprintf("dish:%d:stock", dishID)
	return r.rdb.Set(ctx, key, stock, 24*time.Hour).Err()
}

// GetDishStock 获取菜品库存
func (r *WriteRepository) GetDishStock(ctx context.Context, dishID int) (int64, error) {
	key := fmt.Sprintf("dish:%d:stock", dishID)
	val, err := r.rdb.Get(ctx, key).Int64()
	if err != nil {
		return 0, err
	}
	return val, nil
}

// DecrDishStock 预减菜品库存
func (r *WriteRepository) DecrDishStock(ctx context.Context, dishID int) (int64, error) {
	key := fmt.Sprintf("dish:%d:stock", dishID)
	return r.rdb.Decr(ctx, key).Result()
}

// IncrDishStock 恢复菜品库存
func (r *WriteRepository) IncrDishStock(ctx context.Context, dishID int) (int64, error) {
	key := fmt.Sprintf("dish:%d:stock", dishID)
	return r.rdb.Incr(ctx, key).Result()
}

// ==========================================
// 支付/退款/评价/库存预留 流水 (2026-08-20 新增)
// 原则: 流水表只追加 INSERT, 不 UPDATE(行业惯例)
// ==========================================

// CreatePaymentLog 写支付流水
func (r *WriteRepository) CreatePaymentLog(ctx context.Context, log *model.PaymentLog) error {
	return r.db.WithContext(ctx).Create(log).Error
}

// CreateRefundLog 写退款流水
func (r *WriteRepository) CreateRefundLog(ctx context.Context, log *model.RefundLog) error {
	return r.db.WithContext(ctx).Create(log).Error
}

// CreateDishReview 写菜品评价
func (r *WriteRepository) CreateDishReview(ctx context.Context, review *model.DishReview) error {
	return r.db.WithContext(ctx).Create(review).Error
}

// CreateInventoryReservation 写库存预留记录
func (r *WriteRepository) CreateInventoryReservation(ctx context.Context, resv *model.InventoryReservation) error {
	return r.db.WithContext(ctx).Create(resv).Error
}
