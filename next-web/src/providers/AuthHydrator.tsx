'use client';

import { useEffect, useState } from 'react';
import { useAuthStore, useCartStore } from '@/lib/stores';

/**
 * 在客户端挂载时把 persist 中间件从 localStorage 恢复的 store 数据与
 * 旧 localStorage('token'/'customerToken'/'customerUser')做一次性同步,
 * 保证 SSR 首屏后,后续页面立即可用(useQuery/useCustomerGuard 不必等下一次 setItem)
 */
export default function AuthHydrator({ children }: { children: React.ReactNode }) {
  const [, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 兼容老登录路径:localStorage 仍有 'token' 但 store 没有
    const adminToken = localStorage.getItem('token');
    const adminUserRaw = localStorage.getItem('user');
    if (adminToken) {
      useAuthStore.setState((s) => ({
        adminToken: s.adminToken || adminToken,
        adminUser: s.adminUser || (adminUserRaw ? safeParse(adminUserRaw) : null),
      }));
    }
    const customerToken = localStorage.getItem('customerToken');
    const customerUserRaw = localStorage.getItem('customerUser');
    if (customerToken) {
      useAuthStore.setState((s) => ({
        customerToken: s.customerToken || customerToken,
        customerUser: s.customerUser || (customerUserRaw ? safeParse(customerUserRaw) : null),
      }));
    }
    useCartStore.getState().hydrate();
    setReady(true);
  }, []);

  return <>{children}</>;
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}