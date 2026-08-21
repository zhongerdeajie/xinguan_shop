// ==================== Auth Types ====================
export interface User {
  id: number;
  username: string;
  name?: string;
  phone?: string;
  openid?: string;
  role: string;
  personId?: number;
  createTime?: string;
  createdAt?: string;
  updatedAt: string;
}

export interface CustomerProfile {
  id: number;
  name?: string;
  phone?: string;
  createTime?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface CustomerLoginResponse {
  token: string;
  user: CustomerProfile;
}

// ==================== Order Types ====================
export interface Order {
  id: number;
  number: string;
  status: number;
  userId: number;
  addressBookId: number;
  orderTime: string;
  checkoutTime?: string;
  payMethod: number;
  payStatus: number;
  amount: number;
  remark?: string;
  phone?: string;
  address?: string;
  userName?: string;
  consignee?: string;
  cancelReason?: string;
  rejectionReason?: string;
  cancelTime?: string;
  estimatedDeliveryTime?: string;
  deliveryStatus: number;
  packAmount?: number;
  tablewareNumber?: number;
  tablewareStatus: number;
  orderDetails?: OrderDetail[];
}

export interface OrderDetail {
  id: number;
  name?: string;
  image?: string;
  orderId: number;
  dishId?: number;
  setmealId?: number;
  dishFlavor?: string;
  number: number;
  amount: number;
}

// ==================== Dish Types ====================
export interface Dish {
  id: number;
  name: string;
  categoryId: number;
  categoryName?: string;
  price: number;
  image?: string;
  description?: string;
  status: number;
  createTime: string;
  updateTime?: string;
  createUser?: number;
  updateUser?: number;
  rating?: number;
  sales?: number;
}

export interface Category {
  id: number;
  type?: number;
  name: string;
  sort: number;
  status: number;
}

// ==================== 评价类型 ====================
export interface DishReview {
  id: number;
  orderId: number;
  userId?: number;
  dishId: number;
  rating: number; // 1-5 星
  content?: string;
  images?: string | null;
  isAnonymous: number;
  createdAt: string;
  // 匿名评价时用户信息为空
  userName?: string | null;
  avatar?: string | null;
}

// ==================== Setmeal Types ====================
export interface Setmeal {
  id: number;
  name: string;
  categoryId: number;
  category?: { name: string };
  price: number | string;
  description?: string;
  status: number;
}

// ==================== Employee Types ====================
export interface Employee {
  id: number;
  name: string;
  username: string;
  phone?: string;
  sex?: string;
  status: number;
  createTime?: string;
}

// ==================== Coupon Types ====================
export interface Coupon {
  id: number;
  title: string;
  amount: number | string;
  threshold: number | string;
  status: number;
}

export interface MyCoupon {
  id: number;
  status: number;
  couponId?: number;
  coupon?: Coupon;
}

// ==================== Dashboard Types ====================
export interface DashboardStats {
  totalOrders: number;
  totalDishes: number;
  totalUsers: number;
  todayRevenue: number;
  trend?: { date: string; count: number }[];
  topDishes?: { name: string; sales: number }[];
}

// ==================== Common Types ====================
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// ==================== Browse / Chat History ====================
export interface BrowseItem {
  id: number;
  viewTime: string;
  dish?: { id: number; name?: string; price?: number | string; description?: string };
}

export interface ChatHistoryItem {
  id: number;
  role: string;
  content: string;
  intent?: string;
  createTime: string;
}