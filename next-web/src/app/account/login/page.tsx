'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { authAPI } from '@/lib/api';
import { mergeLocalCartToServer, getLocalCartCount } from '@/lib/cart-storage';
import { useAuthStore } from '@/lib/stores';
import { useToast } from '@/lib/use-toast';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const toast = useToast();

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === 'login') {
        return authAPI.customerLogin(phone, password) as Promise<any>;
      }
      return authAPI.customerRegister({ name, phone, password }) as Promise<any>;
    },
    onSuccess: async (data: any) => {
      if (!data?.token) {
        toast.show('登录响应缺少 token');
        return;
      }
      localStorage.setItem('customerToken', data.token);
      localStorage.setItem('customerUser', JSON.stringify(data.user));
      useAuthStore.getState().setCustomerAuth(data.token, data.user);

      const pending = getLocalCartCount();
      if (pending > 0) {
        const { merged, failed } = await mergeLocalCartToServer(data.token);
        if (failed > 0) {
          console.warn(`暂存购物车合并:成功 ${merged} / 失败 ${failed}`);
        }
      }
      router.push('/account');
    },
    onError: (err: any) => {
      toast.show(err?.response?.data?.message || '操作失败');
    },
  });

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit.mutate();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-3xl">🍜</span>
            <span className="serif text-xl font-semibold" style={{ color: 'var(--accent)' }}>星选 AI 购物管家</span>
          </Link>
          <Link href="/" className="text-sm" style={{ color: 'var(--muted)' }}>← 返回菜单</Link>
        </div>
        <p className="text-center mb-6 text-sm" style={{ color: 'var(--muted)' }}>登录后可保存浏览记录、聊天记录和订单</p>

        <div className="xcard p-6">
          <div className="flex rounded-full p-1 mb-6" style={{ background: 'var(--bg-deep)' }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors ${
                  mode === m ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'
                }`}
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <form onSubmit={onFormSubmit} className="space-y-3">
            {mode === 'register' && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="昵称"
                required
                className="w-full px-4 py-3 border rounded-lg focus:outline-none"
                style={{ borderColor: 'var(--border)' }}
              />
            )}
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="手机号"
              required
              className="w-full px-4 py-3 border rounded-lg focus:outline-none"
              style={{ borderColor: 'var(--border)' }}
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              type="password"
              required
              minLength={6}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none"
              style={{ borderColor: 'var(--border)' }}
            />
            <p className="text-xs" style={{ color: 'var(--muted)' }}>至少 6 位</p>
            {submit.isError && <p className="text-sm text-red-500">{toast.message || '操作失败'}</p>}
            <button
              disabled={submit.isPending}
              className="pill pill-accent w-full !h-12"
            >
              {submit.isPending ? '请稍候...' : mode === 'login' ? '登 录' : '注册并登录'}
            </button>
            {mode === 'login' && (
              <div className="flex justify-between text-xs mt-2">
                <Link href="/login" className="text-sm" style={{ color: 'var(--muted)' }}>忘记密码?</Link>
              </div>
            )}
          </form>
          <div className="text-center mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <Link href="/" className="text-sm" style={{ color: 'var(--muted)' }}>暂不登录，继续浏览 →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}