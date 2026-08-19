'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { authAPI } from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import { useAuthStore } from '@/lib/stores';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const toast = useToast();

  const login = useMutation({
    mutationFn: () => authAPI.login(username, password),
    onSuccess: (res: any) => {
      if (res?.token) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('user', JSON.stringify(res.user));
        // 同步一份到 store（避免首页 SSR 渲染时取不到）
        useAuthStore.setState({ adminToken: res.token, adminUser: res.user });
        router.push('/dashboard');
      } else {
        toast.show('登录响应缺少 token');
      }
    },
    onError: (err: any) => {
      toast.show(err?.response?.data?.message || '登录失败，请检查用户名和密码');
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md">
        <div className="xcard p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
              <span className="text-3xl">🍜</span>
            </div>
            <h1 className="serif text-2xl font-semibold" style={{ color: 'var(--accent)' }}>星选管家</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>管理员登录 · Admin Console</p>
          </div>

          {login.isError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {toast.message || '登录失败，请检查用户名和密码'}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                placeholder="请输入用户名"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                placeholder="请输入密码"
                required
              />
            </div>

            <button
              type="submit"
              disabled={login.isPending}
              className="pill pill-accent w-full !h-12 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {login.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  登录中...
                </span>
              ) : '登录'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>测试账号: admin / 123456</p>
          </div>
        </div>
      </div>
    </div>
  );
}