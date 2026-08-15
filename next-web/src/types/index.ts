// ==================== Auth Types ====================
export interface User {
  id: number;
  username: string;
  role: string;
  personId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  token: string;
  user: User;
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
}

export interface Category {
  id: number;
  type?: number;
  name: string;
  sort: number;
  status: number;
}

// ==================== Dashboard Types ====================
export interface DashboardStats {
  totalOrders: number;
  totalDishes: number;
  totalUsers: number;
  todayRevenue: number;
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
