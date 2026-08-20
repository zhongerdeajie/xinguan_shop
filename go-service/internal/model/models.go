package model

import "time"

type Employee struct {
	ID        int       `json:"id" gorm:"primaryKey;column:id"`
	Name      string    `json:"name" gorm:"column:name"`
	Username  string    `json:"username" gorm:"column:username"`
	Password  string    `json:"-" gorm:"column:password"`
	Phone     string    `json:"phone" gorm:"column:phone"`
	Sex       string    `json:"sex" gorm:"column:sex"`
	IDNumber  string    `json:"idNumber" gorm:"column:id_number"`
	Status    int       `json:"status" gorm:"column:status;default:1"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:create_time"`
	UpdatedAt time.Time `json:"updatedAt" gorm:"column:update_time"`
	CreatedBy *int      `json:"createdBy" gorm:"column:create_user"`
	UpdatedBy *int      `json:"updatedBy" gorm:"column:update_user"`
}

func (Employee) TableName() string { return "employee" }

type Category struct {
	ID         int       `json:"id" gorm:"primaryKey;column:id"`
	Name       string    `json:"name" gorm:"column:name"`
	Type       int       `json:"type" gorm:"column:type"`
	Sort       int       `json:"sort" gorm:"column:sort;default:0"`
	Status     int       `json:"status" gorm:"column:status;default:1"`
	CreateTime time.Time `json:"createTime" gorm:"column:create_time"`
	UpdateTime time.Time `json:"updateTime" gorm:"column:update_time"`
}

func (Category) TableName() string { return "category" }

type Dish struct {
	ID          int       `json:"id" gorm:"primaryKey;column:id"`
	Name        string    `json:"name" gorm:"column:name"`
	CategoryID  int       `json:"categoryId" gorm:"column:category_id"`
	Price       float64   `json:"price" gorm:"column:price"`
	Image       string    `json:"image" gorm:"column:image"`
	Description string    `json:"description" gorm:"column:description"`
	Status      int       `json:"status" gorm:"column:status;default:1"`
	Stock       int       `json:"stock" gorm:"column:stock;default:0"`
	Version     int       `json:"version" gorm:"column:version;default:0"`
	StockAlert  int       `json:"stockAlert" gorm:"column:stock_alert;default:10"`
	Rating      float64   `json:"rating" gorm:"column:rating;default:4.5"`
	Sales       int       `json:"sales" gorm:"column:sales;default:0"`
	IsSponsored bool      `json:"isSponsored" gorm:"column:is_sponsored;default:false"`
	CreatedAt   time.Time `json:"createdAt" gorm:"column:create_time"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"column:update_time"`
	CreatedBy   *int      `json:"createdBy" gorm:"column:create_user"`
	UpdatedBy   *int      `json:"updatedBy" gorm:"column:update_user"`
}

func (Dish) TableName() string { return "dish" }

type Setmeal struct {
	ID          int       `json:"id" gorm:"primaryKey;column:id"`
	Name        string    `json:"name" gorm:"column:name"`
	CategoryID  int       `json:"categoryId" gorm:"column:category_id"`
	Price       float64   `json:"price" gorm:"column:price"`
	Status      int       `json:"status" gorm:"column:status;default:1"`
	Description string    `json:"description" gorm:"column:description"`
	Image       string    `json:"image" gorm:"column:image"`
	Sort        int       `json:"sort" gorm:"column:sort"`
	CreatedAt   time.Time `json:"createdAt" gorm:"column:create_time"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"column:update_time"`
	CreatedBy   *int      `json:"createdBy" gorm:"column:create_user"`
	UpdatedBy   *int      `json:"updatedBy" gorm:"column:update_user"`
}

func (Setmeal) TableName() string { return "setmeal" }

type SetmealDish struct {
	ID        int     `json:"id" gorm:"primaryKey;column:id"`
	SetmealID int     `json:"setmealId" gorm:"column:setmeal_id"`
	DishID    int     `json:"dishId" gorm:"column:dish_id"`
	Name      string  `json:"name" gorm:"column:name"`
	Price     float64 `json:"price" gorm:"column:price"`
	Copies    int     `json:"copies" gorm:"column:copies"`
	Sort      int     `json:"sort" gorm:"column:sort"`
}

func (SetmealDish) TableName() string { return "setmeal_dish" }

type User struct {
	ID        int       `json:"id" gorm:"primaryKey;column:id"`
	Openid    string    `json:"openid" gorm:"column:openid"`
	Name      string    `json:"name" gorm:"column:name"`
	Phone     string    `json:"phone" gorm:"column:phone"`
	Sex       string    `json:"sex" gorm:"column:sex"`
	IDNumber  string    `json:"idNumber" gorm:"column:id_number"`
	Avatar    string    `json:"avatar" gorm:"column:avatar"`
	CreatedAt time.Time `json:"createdAt" gorm:"column:create_time"`
}

func (User) TableName() string { return "user" }

type AddressBook struct {
	ID           int    `json:"id" gorm:"primaryKey;column:id"`
	UserID       int    `json:"userId" gorm:"column:user_id"`
	Consignee    string `json:"consignee" gorm:"column:consignee"`
	Sex          string `json:"sex" gorm:"column:sex"`
	Phone        string `json:"phone" gorm:"column:phone"`
	ProvinceCode string `json:"provinceCode" gorm:"column:province_code"`
	ProvinceName string `json:"provinceName" gorm:"column:province_name"`
	CityCode     string `json:"cityCode" gorm:"column:city_code"`
	CityName     string `json:"cityName" gorm:"column:city_name"`
	DistrictCode string `json:"districtCode" gorm:"column:district_code"`
	DistrictName string `json:"districtName" gorm:"column:district_name"`
	Detail       string `json:"detail" gorm:"column:detail"`
	Label        string `json:"label" gorm:"column:label"`
	IsDefault    int    `json:"isDefault" gorm:"column:is_default;default:0"`
}

func (AddressBook) TableName() string { return "address_book" }

type ShoppingCart struct {
	ID         int       `json:"id" gorm:"primaryKey;column:id"`
	Name       string    `json:"name" gorm:"column:name"`
	Image      string    `json:"image" gorm:"column:image"`
	UserID     int       `json:"userId" gorm:"column:user_id"`
	DishID     *int      `json:"dishId" gorm:"column:dish_id"`
	SetmealID  *int      `json:"setmealId" gorm:"column:setmeal_id"`
	DishFlavor string    `json:"dishFlavor" gorm:"column:dishFlavor"`
	Number     int       `json:"number" gorm:"column:number"`
	Amount     float64   `json:"amount" gorm:"column:amount"`
	CreatedAt  time.Time `json:"createdAt" gorm:"column:create_time"`
}

func (ShoppingCart) TableName() string { return "shopping_cart" }

const (
	OrderPending   = 1
	OrderPaid      = 2
	OrderAccepted  = 3
	OrderDelivery  = 4
	OrderCompleted = 5
	OrderCancelled = 6
)

const (
	PayUnpaid = 0
	PayPaid   = 1
	PayRefund = 2
)

type Orders struct {
	ID             int64      `json:"id" gorm:"primaryKey;column:id"`
	OrderNumber    string     `json:"orderNumber" gorm:"column:number;uniqueIndex"`
	Status         int        `json:"status" gorm:"column:status;default:1"`
	UserID         int        `json:"userId" gorm:"column:user_id"`
	AddressBookID  int        `json:"addressBookId" gorm:"column:address_book_id"`
	OrderTime      time.Time  `json:"orderTime" gorm:"column:order_time"`
	CheckoutTime   *time.Time `json:"checkoutTime" gorm:"column:checkout_time"`
	PayMethod      int        `json:"payMethod" gorm:"column:pay_method"`
	PayStatus      int        `json:"payStatus" gorm:"column:pay_status;default:0"`
	Amount         float64    `json:"amount" gorm:"column:amount"`
	DiscountAmount float64    `json:"discountAmount" gorm:"column:discount_amount"`
	Remark         string     `json:"remark" gorm:"column:remark"`
	Phone          string     `json:"phone" gorm:"column:phone"`
	Address        string     `json:"address" gorm:"column:address"`
	UserName       string     `json:"userName" gorm:"column:user_name"`
	Consignee      string     `json:"consignee" gorm:"column:consignee"`
	CancelReason   string     `json:"cancelReason" gorm:"column:cancel_reason"`
	RejectReason   string     `json:"rejectReason" gorm:"column:rejection_reason"`
	CancelTime     *time.Time `json:"cancelTime" gorm:"column:cancel_time"`
	EstimatedTime  *time.Time `json:"estimatedTime" gorm:"column:estimated_delivery_time"`
}

func (Orders) TableName() string { return "orders" }

type OrderDetail struct {
	ID         int64   `json:"id" gorm:"primaryKey;column:id"`
	Name       string  `json:"name" gorm:"column:name"`
	Image      string  `json:"image" gorm:"column:image"`
	OrderID    int64   `json:"orderId" gorm:"column:order_id"`
	DishID     *int    `json:"dishId" gorm:"column:dish_id"`
	SetmealID  *int    `json:"setmealId" gorm:"column:setmeal_id"`
	DishFlavor string  `json:"dishFlavor" gorm:"column:dishFlavor"`
	Number     int     `json:"number" gorm:"column:number"`
	Amount     float64 `json:"amount" gorm:"column:amount"`
}

func (OrderDetail) TableName() string { return "order_detail" }

// CartItemDTO 购物车添加请求
type CartItemDTO struct {
	DishID     int    `json:"dishId" binding:"required_without=SetmealID"`
	SetmealID  int    `json:"setmealId" binding:"required_without=DishID"`
	Number     int    `json:"number" binding:"required,min=1"`
	DishFlavor string `json:"dishFlavor"`
}

// OrderSubmitDTO 订单提交请求
type OrderSubmitDTO struct {
	AddressBookID int    `json:"addressBookId" binding:"required"`
	Remark        string `json:"remark"`
	PayMethod     int    `json:"payMethod" binding:"required,oneof=1 2"`
	CouponID      int    `json:"couponId"`
}

type Coupon struct {
	ID        int     `json:"id" gorm:"column:id"`
	Title     string  `json:"title" gorm:"column:title"`
	Amount    float64 `json:"amount" gorm:"column:amount"`
	Threshold float64 `json:"threshold" gorm:"column:threshold"`
	Status    int     `json:"status" gorm:"column:status"`
}

func (Coupon) TableName() string { return "coupon" }

type UserCoupon struct {
	ID          int        `json:"id" gorm:"column:id"`
	UserID      int        `json:"userId" gorm:"column:user_id"`
	CouponID    int        `json:"couponId" gorm:"column:coupon_id"`
	Status      int        `json:"status" gorm:"column:status"`
	ClaimedTime time.Time  `json:"claimedTime" gorm:"column:claimed_time"`
	UsedTime    *time.Time `json:"usedTime" gorm:"column:used_time"`
}

func (UserCoupon) TableName() string { return "user_coupon" }

// OrderPaymentDTO 订单支付请求
type OrderPaymentDTO struct {
	OrderNumber string `json:"orderNumber" binding:"required"`
	PayMethod   int    `json:"payMethod" binding:"required,oneof=1 2"`
}

// OrderCancelDTO 订单取消请求
type OrderCancelDTO struct {
	OrderID int64  `json:"orderId" binding:"required"`
	Reason  string `json:"reason"`
}

// OrderPageQueryDTO 订单分页查询
type OrderPageQueryDTO struct {
	Page     int `json:"page" binding:"required,min=1"`
	PageSize int `json:"pageSize" binding:"required,min=1,max=100"`
	Status   int `json:"status"`
}

// PageResult 分页结果
type PageResult struct {
	Total int64       `json:"total"`
	Data  interface{} `json:"data"`
}
