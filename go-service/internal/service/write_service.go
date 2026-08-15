package service

import (
	"context"
	"fmt"

	"go-service/internal/model"
	"go-service/internal/pkg/redis"
	"go-service/internal/repository"
)

// WriteService 写入服务 - 所有写操作经过这里
type WriteService struct {
	repo *repository.WriteRepository
	rdb  *redis.Client
}

func NewWriteService(repo *repository.WriteRepository, rdb *redis.Client) *WriteService {
	return &WriteService{repo: repo, rdb: rdb}
}

// ==========================================
// 员工写入
// ==========================================
func (s *WriteService) CreateEmployee(ctx context.Context, emp *model.Employee) error {
	if err := s.repo.CreateEmployee(ctx, emp); err != nil {
		return fmt.Errorf("创建员工失败: %w", err)
	}
	return nil
}

func (s *WriteService) UpdateEmployee(ctx context.Context, id int, updates map[string]interface{}) error {
	if err := s.repo.UpdateEmployee(ctx, id, updates); err != nil {
		return fmt.Errorf("更新员工失败: %w", err)
	}
	s.repo.InvalidateEmployeeCache(ctx, id)
	return nil
}

func (s *WriteService) DeleteEmployee(ctx context.Context, id int) error {
	if err := s.repo.DeleteEmployee(ctx, id); err != nil {
		return fmt.Errorf("删除员工失败: %w", err)
	}
	s.repo.InvalidateEmployeeCache(ctx, id)
	return nil
}

// ==========================================
// 菜品写入
// ==========================================
func (s *WriteService) CreateDish(ctx context.Context, dish *model.Dish) error {
	if err := s.repo.CreateDish(ctx, dish); err != nil {
		return fmt.Errorf("创建菜品失败: %w", err)
	}
	return nil
}

func (s *WriteService) UpdateDish(ctx context.Context, id int, updates map[string]interface{}) error {
	if err := s.repo.UpdateDish(ctx, id, updates); err != nil {
		return fmt.Errorf("更新菜品失败: %w", err)
	}
	s.repo.InvalidateDishCache(ctx, id)
	return nil
}

func (s *WriteService) DeleteDish(ctx context.Context, id int) error {
	if err := s.repo.DeleteDish(ctx, id); err != nil {
		return fmt.Errorf("删除菜品失败: %w", err)
	}
	s.repo.InvalidateDishCache(ctx, id)
	return nil
}

// ==========================================
// 套餐写入
// ==========================================
func (s *WriteService) CreateSetmeal(ctx context.Context, setmeal *model.Setmeal) error {
	if err := s.repo.CreateSetmeal(ctx, setmeal); err != nil {
		return fmt.Errorf("创建套餐失败: %w", err)
	}
	return nil
}

func (s *WriteService) UpdateSetmeal(ctx context.Context, id int, updates map[string]interface{}) error {
	if err := s.repo.UpdateSetmeal(ctx, id, updates); err != nil {
		return fmt.Errorf("更新套餐失败: %w", err)
	}
	s.repo.InvalidateSetmealCache(ctx, id)
	return nil
}

func (s *WriteService) DeleteSetmeal(ctx context.Context, id int) error {
	if err := s.repo.DeleteSetmeal(ctx, id); err != nil {
		return fmt.Errorf("删除套餐失败: %w", err)
	}
	s.repo.InvalidateSetmealCache(ctx, id)
	return nil
}

// ==========================================
// C端用户写入
// ==========================================
func (s *WriteService) CreateUser(ctx context.Context, user *model.User) error {
	if err := s.repo.CreateUser(ctx, user); err != nil {
		return fmt.Errorf("创建用户失败: %w", err)
	}
	return nil
}

func (s *WriteService) UpdateUser(ctx context.Context, id int, updates map[string]interface{}) error {
	if err := s.repo.UpdateUser(ctx, id, updates); err != nil {
		return fmt.Errorf("更新用户失败: %w", err)
	}
	return nil
}

// ==========================================
// 地址簿写入
// ==========================================
func (s *WriteService) CreateAddressBook(ctx context.Context, addr *model.AddressBook) error {
	if err := s.repo.CreateAddressBook(ctx, addr); err != nil {
		return fmt.Errorf("创建地址失败: %w", err)
	}
	return nil
}

func (s *WriteService) UpdateAddressBook(ctx context.Context, userID, id int, updates map[string]interface{}) error {
	if err := s.repo.UpdateAddressBook(ctx, userID, id, updates); err != nil {
		return fmt.Errorf("更新地址失败: %w", err)
	}
	return nil
}

func (s *WriteService) DeleteAddressBook(ctx context.Context, userID, id int) error {
	if err := s.repo.DeleteAddressBook(ctx, userID, id); err != nil {
		return fmt.Errorf("删除地址失败: %w", err)
	}
	return nil
}

func (s *WriteService) SetDefaultAddress(ctx context.Context, userID, addrID int) error {
	if err := s.repo.SetDefaultAddress(ctx, userID, addrID); err != nil {
		return fmt.Errorf("设置默认地址失败: %w", err)
	}
	return nil
}

// ==========================================
// 订单写入
// ==========================================
func (s *WriteService) CreateOrder(ctx context.Context, order *model.Orders, details []model.OrderDetail) error {
	if err := s.repo.CreateOrder(ctx, order, details); err != nil {
		return fmt.Errorf("创建订单失败: %w", err)
	}
	return nil
}

func (s *WriteService) UpdateOrderStatus(ctx context.Context, orderID int64, status int) error {
	if err := s.repo.UpdateOrderStatus(ctx, orderID, status); err != nil {
		return fmt.Errorf("更新订单状态失败: %w", err)
	}
	return nil
}

func (s *WriteService) CancelOrder(ctx context.Context, orderID int64, reason string) error {
	if err := s.repo.CancelOrder(ctx, orderID, reason); err != nil {
		return fmt.Errorf("取消订单失败: %w", err)
	}
	return nil
}

func (s *WriteService) PayOrder(ctx context.Context, orderID int64, payMethod int) error {
	if err := s.repo.PayOrder(ctx, orderID, payMethod); err != nil {
		return fmt.Errorf("支付订单失败: %w", err)
	}
	return nil
}

// ==========================================
// 购物车写入
// ==========================================
func (s *WriteService) AddToCart(ctx context.Context, cart *model.ShoppingCart) error {
	if err := s.repo.AddToCart(ctx, cart); err != nil {
		return fmt.Errorf("添加购物车失败: %w", err)
	}
	return nil
}

func (s *WriteService) UpdateCartItem(ctx context.Context, id int, number int, amount float64) error {
	if err := s.repo.UpdateCartItem(ctx, id, number, amount); err != nil {
		return fmt.Errorf("更新购物车失败: %w", err)
	}
	return nil
}

func (s *WriteService) DeleteCartItem(ctx context.Context, userID, id int) error {
	if err := s.repo.DeleteCartItem(ctx, userID, id); err != nil {
		return fmt.Errorf("删除购物车项失败: %w", err)
	}
	return nil
}

func (s *WriteService) ClearCart(ctx context.Context, userID int) error {
	if err := s.repo.ClearCart(ctx, userID); err != nil {
		return fmt.Errorf("清空购物车失败: %w", err)
	}
	return nil
}

// ==========================================
// Redis 库存管理
// ==========================================
func (s *WriteService) SyncDishStock(ctx context.Context, dishID int, stock int) error {
	if err := s.repo.SyncDishStock(ctx, dishID, stock); err != nil {
		return fmt.Errorf("同步菜品库存失败: %w", err)
	}
	return nil
}

func (s *WriteService) GetDishStock(ctx context.Context, dishID int) (int64, error) {
	return s.repo.GetDishStock(ctx, dishID)
}

func (s *WriteService) DecrDishStock(ctx context.Context, dishID int) (int64, error) {
	return s.repo.DecrDishStock(ctx, dishID)
}

func (s *WriteService) IncrDishStock(ctx context.Context, dishID int) (int64, error) {
	return s.repo.IncrDishStock(ctx, dishID)
}
