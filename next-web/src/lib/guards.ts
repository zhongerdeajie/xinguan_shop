'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores';

/**
 * 管理后台鉴权守卫：未登录跳 /login
 * - 在每个 admin 页面顶部调用即可,不必在每个 useEffect 里写一遍 if(!token) router.push
 * - 同时兼容 store + localStorage(老页面还在写 localStorage)
 */
export function useAdminGuard(): boolean {
  const router = useRouter();
  const adminToken = useAuthStore((s) => s.adminToken);
  useEffect(() => {
    const ok = adminToken || (typeof window !== 'undefined' && localStorage.getItem('token'));
    if (!ok) router.push('/login');
  }, [adminToken, router]);
  return !!adminToken;
}

/**
 * 顾客鉴权守卫：未登录跳 /account/login
 */
export function useCustomerGuard(): boolean {
  const router = useRouter();
  const customerToken = useAuthStore((s) => s.customerToken);
  useEffect(() => {
    const ok = customerToken || (typeof window !== 'undefined' && localStorage.getItem('customerToken'));
    if (!ok) router.push('/account/login');
  }, [customerToken, router]);
  return !!customerToken;
}