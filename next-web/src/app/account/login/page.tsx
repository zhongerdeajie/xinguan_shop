'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url =
        mode === 'login' ? '/api/auth/customer/login' : '/api/auth/customer/register';
      const body =
        mode === 'login'
          ? { phone, password }
          : { name, phone, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '操作失败');
      }
      const data = await res.json();
      localStorage.setItem('customerToken', data.token);
      localStorage.setItem('customerUser', JSON.stringify(data.user));
      router.push('/account');
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-3xl">🍜</span>
            <span className="serif text-xl font-semibold" style={{ color: 'var(--accent)' }}>星选 AI 购物管家</span>
          </Link>
          <p className="mt-2" style={{ color: 'var(--muted)' }}>登录后可保存浏览记录、聊天记录和订单</p>
        </div>

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

          <form onSubmit={submit} className="space-y-3">
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
                placeholder="密码（至少 6 位）"
                type="password"
                required
                minLength={6}
                className="w-full px-4 py-3 border rounded-lg focus:outline-none"
                style={{ borderColor: 'var(--border)' }}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              disabled={loading}
              className="pill pill-accent w-full !h-12"
            >
              {loading ? '请稍候...' : mode === 'login' ? '登 录' : '注册并登录'}
            </button>
          </form>
        </div>

        <div className="text-center mt-4">
          <Link href="/" className="text-sm" style={{ color: 'var(--muted)' }}>
            ← 返回菜单
          </Link>
        </div>
      </div>
    </div>
  );
}
