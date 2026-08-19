import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { categoriesAPI, dashboardAPI, dishesAPI, employeesAPI, marketingAPI, ordersAPI, setmealsAPI, usersAPI } from '@/lib/api';
import type { Category, Coupon, DashboardStats, Dish, Employee, MyCoupon, Order, Setmeal, User } from '@/types';

const normalizeList = <T>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: T[] }).data)) {
    return (payload as { data: T[] }).data;
  }
  return [];
};

export const queryKeys = {
  dishes: (page: number, categoryId?: number | '') => ['dishes', page, categoryId] as const,
  categories: ['categories'] as const,
  orders: (page: number, status?: number | '') => ['orders', page, status] as const,
  users: ['users'] as const,
  employees: ['employees'] as const,
  setmeals: ['setmeals'] as const,
  categoriesAdmin: ['categories', 'admin'] as const,
  coupons: ['coupons'] as const,
  dashboard: ['dashboard', 'stats'] as const,
  customer: {
    profile: ['customer', 'profile'] as const,
    orders: ['customer', 'orders'] as const,
    history: ['customer', 'history'] as const,
    chat: ['customer', 'chat'] as const,
    coupons: ['customer', 'coupons'] as const,
  },
  cart: ['customer', 'cart'] as const,
};

const unauthorizedRedirect = '/login';

export function useDishesQuery(page: number, categoryId?: number | '') {
  return useQuery({
    queryKey: queryKeys.dishes(page, categoryId),
    queryFn: async () =>
      (await dishesAPI.findAll(page, 20, categoryId || undefined)) as unknown as {
        data: Dish[];
        meta: { totalPages: number };
      },
  });
}

export function useCategoriesQuery() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => dishesAPI.getCategories() as Promise<Category[] | { data: Category[] }>,
  });
}

export function useOrdersQuery(page: number, status?: number | '') {
  return useQuery({
    queryKey: queryKeys.orders(page, status),
    queryFn: async () =>
      (await ordersAPI.findAll(page, 20, status || undefined)) as unknown as {
        data: Order[];
        meta: { totalPages: number };
      },
  });
}

export function useUpdateOrderStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: number }) => ordersAPI.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useUsersQuery() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: async () => normalizeList<User>(await usersAPI.findAll(1, 100)),
  });
}

export function useRemoveUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => usersAPI.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  });
}

export function useEmployeesQuery() {
  return useQuery({
    queryKey: queryKeys.employees,
    queryFn: async () => normalizeList<Employee>(await employeesAPI.findAll()),
  });
}

export function useEmployeeMutations() {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => employeesAPI.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.employees }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => employeesAPI.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.employees }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => employeesAPI.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.employees }),
  });
  return { create, update, remove };
}

export function useSetmealsQuery() {
  return useQuery({
    queryKey: queryKeys.setmeals,
    queryFn: async () => normalizeList<Setmeal>(await setmealsAPI.findAll()),
  });
}

export function useSetmealMutations() {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => setmealsAPI.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.setmeals }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => setmealsAPI.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.setmeals }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => setmealsAPI.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.setmeals }),
  });
  return { create, update, remove };
}

export function useCategoriesAdminQuery() {
  return useQuery({
    queryKey: queryKeys.categoriesAdmin,
    queryFn: async () => normalizeList<Category>(await categoriesAPI.findAll()),
  });
}

export function useCategoryMutations() {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => categoriesAPI.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.categoriesAdmin }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => categoriesAPI.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.categoriesAdmin }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => categoriesAPI.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.categoriesAdmin }),
  });
  return { create, update, remove };
}

export function useCouponsQuery() {
  return useQuery({
    queryKey: queryKeys.coupons,
    queryFn: async () => normalizeList<Coupon>(await marketingAPI.findCoupons()),
  });
}

export function useCouponMutations() {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (body: { title: string; amount: number; threshold: number }) => marketingAPI.createCoupon(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.coupons }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => marketingAPI.removeCoupon(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.coupons }),
  });
  return { create, remove };
}

export function useDashboardStatsQuery() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async () => (await dashboardAPI.getStats()) as unknown as DashboardStats,
  });
}

export function useCustomerProfileQuery() {
  return useQuery({
    queryKey: queryKeys.customer.profile,
    queryFn: async () => {
      const res = await api.get('/customer/profile');
      return res.data as { id: number; name?: string; phone?: string };
    },
  });
}

export function useCustomerOrdersQuery() {
  return useQuery({
    queryKey: queryKeys.customer.orders,
    queryFn: async () => normalizeList<Order>(await api.get('/customer/orders')),
  });
}

export function useCustomerHistoryQuery() {
  return useQuery({
    queryKey: queryKeys.customer.history,
    queryFn: async () => normalizeList<{ id: number; viewTime: string; dish?: { id: number; name?: string; price?: number | string; description?: string } }>(await api.get('/customer/history')),
  });
}

export function useCustomerChatQuery() {
  return useQuery({
    queryKey: queryKeys.customer.chat,
    queryFn: async () => normalizeList<{ id: number; role: string; content: string; intent?: string; createTime: string }>(await api.get('/customer/chat-history')),
  });
}

export function useCustomerCouponsQuery() {
  return useQuery({
    queryKey: queryKeys.customer.coupons,
    queryFn: async () => normalizeList<MyCoupon>(await api.get('/customer/coupons')),
  });
}

export function useCartQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.cart,
    enabled,
    queryFn: async () => {
      const res = await api.get('/go/cart');
      return normalizeList<{ id: number; name: string; number: number; amount: number | string; dishId?: number | null }>(res);
    },
  });
}

export const unauthorizedRedirectPath = unauthorizedRedirect;