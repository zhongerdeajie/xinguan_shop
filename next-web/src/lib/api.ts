import axios from 'axios';

const api = axios.create({
  baseURL: typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') : 'http://localhost:3000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  // HttpOnly Cookie 鉴权：开启 withCredentials,浏览器自动带 cookie,
  // 后端 JWT strategy 已经支持优先读 cookie、fallback 读 Authorization 头
  withCredentials: true,
});

// 请求拦截器 — 优先依赖 cookie（HttpOnly,JS 读不到,完全抗 XSS）;
// 仅在 cookie 不存在时 fallback 读 localStorage（兼容老 Vue admin 后台）
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // 探测是否有 cookie：有 cookie 就不读 localStorage,避免 localStorage 过期 token 把请求拦掉
    const hasCookie = document.cookie.includes('admin_token=') || document.cookie.includes('customer_token=');
    if (!hasCookie) {
      // 老路径：老前端还在用 localStorage,这里兜底兼容
      const token = localStorage.getItem('token') || localStorage.getItem('customerToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  }
  return config;
});

// 响应拦截器 — 统一错误处理
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        // 401：清理本地残留(老路径兼容),cookie 由后端 /logout 清
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('customerToken');
        localStorage.removeItem('customerUser');
        const isCustomer = document.cookie.includes('customer_token=') || !!localStorage.getItem('customerToken');
        window.location.href = isCustomer ? '/account/login' : '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;

// ==================== Auth API ====================
export const authAPI = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  register: (data: any) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
};

// ==================== Orders API ====================
export const ordersAPI = {
  findAll: (page = 1, limit = 20, status?: number) =>
    api.get('/orders', { params: { page, limit, status } }),
  findOne: (id: number) => api.get(`/orders/${id}`),
  create: (data: any) => api.post('/orders', data),
  update: (id: number, data: any) => api.put(`/orders/${id}`, data),
  updateStatus: (id: number, status: number) =>
    api.patch(`/orders/${id}/status`, { status }),
  remove: (id: number) => api.delete(`/orders/${id}`),
};

// ==================== Dishes API ====================
export const dishesAPI = {
  findAll: (page = 1, limit = 20, categoryId?: number) =>
    api.get('/dishes', { params: { page, limit, categoryId } }),
  findOne: (id: number) => api.get(`/dishes/${id}`),
  create: (data: any) => api.post('/dishes', data),
  update: (id: number, data: any) => api.put(`/dishes/${id}`, data),
  remove: (id: number) => api.delete(`/dishes/${id}`),
  getCategories: () => api.get('/categories'),
};

// ==================== Dashboard API ====================
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
};

// ==================== Users API ====================
export const usersAPI = {
  findAll: (page = 1, limit = 20) => api.get(`/users?page=${page}&limit=${limit}`),
  findOne: (id: number) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  remove: (id: number) => api.delete(`/users/${id}`),
};
