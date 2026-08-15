package service

import (
	"context"
	"fmt"
	"math/rand"
	"strconv"
	"time"

	"go-service/internal/model"
	"go-service/internal/pkg/redis"
	"go-service/internal/repository"
)

// OrderService 订单服务 - 购物车、订单、支付相关操作
type OrderService struct {
	repo *repository.WriteRepository
	rdb  *redis.Client
}

func NewOrderService(repo *repository.WriteRepository, rdb *redis.Client) *OrderService {
	return &OrderService{repo: repo, rdb: rdb}
}

// ==========================================
// 购物车服务
// ==========================================

// AddToCart 添加购物车
func (s *OrderService) AddToCart(ctx context.Context, userID int, dto model.CartItemDTO) error {
	var name string
	var image string
	var price float64

	if dto.DishID > 0 {
		var dish model.Dish
		if err := s.repo.GetDB().WithContext(ctx).Where("id = ? AND status = 1", dto.DishID).First(&dish).Error; err != nil {
			return fmt.Errorf("菜品不存在或已停售")
		}
		// 初始化库存（下单扣减依赖 dish:{id}:stock）
		s.rdb.SetNX(ctx, fmt.Sprintf("dish:%d:stock", dto.DishID), 100, 0)
		name = dish.Name
		image = dish.Image
		price = dish.Price

		existing, err := s.repo.FindCartItemByUserAndDish(ctx, userID, dto.DishID)
		if err == nil {
			newNumber := existing.Number + dto.Number
			return s.repo.UpdateCartItem(ctx, existing.ID, newNumber, price*float64(newNumber))
		}
	} else if dto.SetmealID > 0 {
		var setmeal model.Setmeal
		if err := s.repo.GetDB().WithContext(ctx).Where("id = ? AND status = 1", dto.SetmealID).First(&setmeal).Error; err != nil {
			return fmt.Errorf("套餐不存在或已停售")
		}
		name = setmeal.Name
		image = setmeal.Image
		price = setmeal.Price
	} else {
		return fmt.Errorf("菜品ID和套餐ID不能同时为空")
	}

	cart := model.ShoppingCart{
		Name:       name,
		Image:      image,
		UserID:     userID,
		Number:     dto.Number,
		Amount:     price * float64(dto.Number),
		DishFlavor: dto.DishFlavor,
	}
	if dto.DishID > 0 {
		cart.DishID = &dto.DishID
	} else {
		cart.SetmealID = &dto.SetmealID
	}

	return s.repo.AddToCart(ctx, &cart)
}

// GetCartList 获取购物车列表
func (s *OrderService) GetCartList(ctx context.Context, userID int) ([]model.ShoppingCart, error) {
	return s.repo.FindCartItemsByUserID(ctx, userID)
}

// UpdateCartNumber 更新购物车数量
func (s *OrderService) UpdateCartNumber(ctx context.Context, userID, cartID, number int) error {
	var cart model.ShoppingCart
	if err := s.repo.GetDB().WithContext(ctx).Where("id = ? AND user_id = ?", cartID, userID).First(&cart).Error; err != nil {
		return fmt.Errorf("购物车项不存在")
	}

	var price float64
	if cart.DishID != nil {
		var dish model.Dish
		if err := s.repo.GetDB().WithContext(ctx).Where("id = ?", *cart.DishID).First(&dish).Error; err != nil {
			return fmt.Errorf("菜品不存在")
		}
		price = dish.Price
	} else if cart.SetmealID != nil {
		var setmeal model.Setmeal
		if err := s.repo.GetDB().WithContext(ctx).Where("id = ?", *cart.SetmealID).First(&setmeal).Error; err != nil {
			return fmt.Errorf("套餐不存在")
		}
		price = setmeal.Price
	}

	return s.repo.UpdateCartItem(ctx, cartID, number, price*float64(number))
}

// DeleteCartItem 删除当前用户的购物车项
func (s *OrderService) DeleteCartItem(ctx context.Context, userID, cartID int) error {
	return s.repo.DeleteCartItem(ctx, userID, cartID)
}

// ClearCart 清空购物车
func (s *OrderService) ClearCart(ctx context.Context, userID int) error {
	return s.repo.ClearCart(ctx, userID)
}

// ==========================================
// 订单服务（含 Redis 分布式锁防止超卖）
// ==========================================

// SubmitOrder 提交订单
func (s *OrderService) SubmitOrder(ctx context.Context, userID int, dto model.OrderSubmitDTO) (*model.Orders, error) {
	cartItems, err := s.repo.FindCartItemsByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("获取购物车失败: %w", err)
	}
	if len(cartItems) == 0 {
		return nil, fmt.Errorf("购物车为空，无法提交订单")
	}

	var address model.AddressBook
	if err := s.repo.GetDB().WithContext(ctx).Where("id = ? AND user_id = ?", dto.AddressBookID, userID).First(&address).Error; err != nil {
		return nil, fmt.Errorf("收货地址不存在")
	}

	orderNumber := generateOrderNumber()

	var totalAmount float64
	details := make([]model.OrderDetail, 0, len(cartItems))

	for _, item := range cartItems {
		if item.DishID != nil {
			lockKey := fmt.Sprintf("lock:dish:%d", *item.DishID)
			locked, err := s.rdb.SetNX(ctx, lockKey, "1", 10*time.Second).Result()
			if err != nil || !locked {
				return nil, fmt.Errorf("系统繁忙，请稍后重试")
			}
			defer s.rdb.Del(ctx, lockKey)

			stockKey := fmt.Sprintf("dish:%d:stock", *item.DishID)
			// 初始化库存：key 不存在则设为 100
			s.rdb.SetNX(ctx, stockKey, 100, 0)
			// 按购物车数量扣减库存（之前每次只 Decr 1，多份商品会少扣）
			decrement := int64(item.Number)
			stock, err := s.rdb.DecrBy(ctx, stockKey, decrement).Result()
			if err != nil {
				return nil, fmt.Errorf("扣减库存失败: %w", err)
			}
			if stock < 0 {
				// 库存不足：把已经扣减的数量加回去，避免脏数据，然后拒绝订单
				s.rdb.IncrBy(ctx, stockKey, decrement)
				return nil, fmt.Errorf("菜品 [%s] 库存不足", item.Name)
			}
		} else if item.SetmealID != nil {
			lockKey := fmt.Sprintf("lock:setmeal:%d", *item.SetmealID)
			locked, err := s.rdb.SetNX(ctx, lockKey, "1", 10*time.Second).Result()
			if err != nil || !locked {
				return nil, fmt.Errorf("系统繁忙，请稍后重试")
			}
			defer s.rdb.Del(ctx, lockKey)
		}

		totalAmount += item.Amount

		detail := model.OrderDetail{
			Name:       item.Name,
			Image:      item.Image,
			DishID:     item.DishID,
			SetmealID:  item.SetmealID,
			DishFlavor: item.DishFlavor,
			Number:     item.Number,
			Amount:     item.Amount,
		}
		details = append(details, detail)
	}

	// 优惠券：校验归属/门槛 → 扣减 → 核销
	discount := 0.0
	if dto.CouponID > 0 {
		coupon, err := s.repo.GetCouponByID(ctx, dto.CouponID)
		if err != nil {
			rollbackCartStock(s.rdb, cartItems)
			return nil, fmt.Errorf("优惠券不存在或已停发")
		}
		uc, err := s.repo.GetUserCoupon(ctx, userID, dto.CouponID)
		if err != nil {
			rollbackCartStock(s.rdb, cartItems)
			return nil, fmt.Errorf("未领取该优惠券或已使用")
		}
		if totalAmount < coupon.Threshold {
			rollbackCartStock(s.rdb, cartItems)
			return nil, fmt.Errorf("未达到优惠券门槛（满 %.2f 元可用）", coupon.Threshold)
		}
		discount = coupon.Amount
		if discount > totalAmount {
			discount = totalAmount
		}
		if err := s.repo.MarkUserCouponUsed(ctx, uc.ID); err != nil {
			rollbackCartStock(s.rdb, cartItems)
			return nil, fmt.Errorf("优惠券核销失败")
		}
	}
	totalAmount -= discount

	now := time.Now()
	estTime := now.Add(30 * time.Minute)
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

	if err := s.repo.CreateOrder(ctx, order, details); err != nil {
		rollbackCartStock(s.rdb, cartItems)
		return nil, fmt.Errorf("创建订单失败: %w", err)
	}

	if err := s.repo.ClearCart(ctx, userID); err != nil {
		fmt.Printf("清空购物车失败: %v\n", err)
	}

	return order, nil
}

// PayOrder 订单支付
func (s *OrderService) PayOrder(ctx context.Context, userID int, dto model.OrderPaymentDTO) error {
	order, err := s.repo.GetOrderByNumber(ctx, dto.OrderNumber)
	if err != nil {
		return fmt.Errorf("订单不存在")
	}

	if order.UserID != userID {
		return fmt.Errorf("无权操作该订单")
	}

	if order.Status != model.OrderPending {
		return fmt.Errorf("订单状态不允许支付")
	}

	if err := s.repo.PayOrder(ctx, order.ID, dto.PayMethod); err != nil {
		return fmt.Errorf("支付失败: %w", err)
	}

	return nil
}

// RefundOrder 真实退款：校验归属与支付状态，恢复库存，标记已退款
func (s *OrderService) RefundOrder(ctx context.Context, userID int, orderID int64) error {
	order, err := s.repo.GetOrderByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("订单不存在")
	}
	if order.UserID != userID {
		return fmt.Errorf("无权操作该订单")
	}
	if order.PayStatus != model.PayPaid {
		return fmt.Errorf("订单未支付，无法退款")
	}

	// 恢复库存
	if details, err := s.repo.GetOrderDetailsByOrderID(ctx, orderID); err == nil {
		for _, detail := range details {
			if detail.DishID != nil {
				stockKey := fmt.Sprintf("dish:%d:stock", *detail.DishID)
				s.rdb.IncrBy(ctx, stockKey, int64(detail.Number))
			}
		}
	}

	if err := s.repo.RefundOrder(ctx, orderID, "用户申请退款"); err != nil {
		return fmt.Errorf("退款失败: %w", err)
	}
	return nil
}

// CancelOrder 取消订单
func (s *OrderService) CancelOrder(ctx context.Context, userID int, dto model.OrderCancelDTO) error {
	order, err := s.repo.GetOrderByID(ctx, dto.OrderID)
	if err != nil {
		return fmt.Errorf("订单不存在")
	}

	if order.UserID != userID {
		return fmt.Errorf("无权操作该订单")
	}

	if order.Status != model.OrderPending && order.Status != model.OrderPaid {
		return fmt.Errorf("订单状态不允许取消")
	}

	lockKey := fmt.Sprintf("lock:order:%d", dto.OrderID)
	locked, err := s.rdb.SetNX(ctx, lockKey, "1", 10*time.Second).Result()
	if err != nil || !locked {
		return fmt.Errorf("系统繁忙，请稍后重试")
	}
	defer s.rdb.Del(ctx, lockKey)

	details, err := s.repo.GetOrderDetailsByOrderID(ctx, dto.OrderID)
	if err == nil {
		for _, detail := range details {
			if detail.DishID != nil {
				stockKey := fmt.Sprintf("dish:%d:stock", *detail.DishID)
				s.rdb.IncrBy(ctx, stockKey, int64(detail.Number))
			}
		}
	}

	if err := s.repo.CancelOrder(ctx, dto.OrderID, dto.Reason); err != nil {
		return fmt.Errorf("取消订单失败: %w", err)
	}

	if order.PayStatus == model.PayPaid {
		fmt.Printf("订单 %d 已支付，需要退款 %.2f 元\n", dto.OrderID, order.Amount)
	}

	return nil
}

// GetOrderDetail 获取订单详情
func (s *OrderService) GetOrderDetail(ctx context.Context, userID, orderID int64) (*model.Orders, error) {
	order, err := s.repo.GetOrderByID(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("订单不存在")
	}

	if order.UserID != int(userID) {
		return nil, fmt.Errorf("无权查看该订单")
	}

	return order, nil
}

// GetOrderList 获取订单列表（分页）
func (s *OrderService) GetOrderList(ctx context.Context, userID int, query model.OrderPageQueryDTO) (*model.PageResult, error) {
	db := s.repo.GetDB().WithContext(ctx).Model(&model.Orders{}).Where("user_id = ?", userID)

	if query.Status > 0 {
		db = db.Where("status = ?", query.Status)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("查询订单总数失败: %w", err)
	}

	var orders []model.Orders
	page := query.Page
	if page < 1 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize < 1 {
		pageSize = 10
	}
	if err := db.Order("order_time DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&orders).Error; err != nil {
		return nil, fmt.Errorf("查询订单列表失败: %w", err)
	}

	return &model.PageResult{
		Total: total,
		Data:  orders,
	}, nil
}

// generateOrderNumber 生成订单号
func generateOrderNumber() string {
	now := time.Now()
	return fmt.Sprintf("%s%04d",
		now.Format("20060102150405"),
		rand.Intn(10000),
	)
}

// rollbackCartStock 回滚购物车库存
func rollbackCartStock(rdb *redis.Client, cartItems []model.ShoppingCart) {
	ctx := context.Background()
	for _, item := range cartItems {
		if item.DishID != nil {
			stockKey := fmt.Sprintf("dish:%d:stock", *item.DishID)
			rdb.IncrBy(ctx, stockKey, int64(item.Number))
		}
	}
}

// ParseInt 字符串转int
func ParseInt(s string) int {
	i, _ := strconv.Atoi(s)
	return i
}
