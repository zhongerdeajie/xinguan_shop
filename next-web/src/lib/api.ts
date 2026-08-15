import axios from 'axios';

const api = axios.create({
  baseURL: typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') : 'http://localhost:3000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// 请求拦截器 — 自动附加 token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
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
