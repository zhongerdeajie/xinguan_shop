'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

interface Coupon {
  id: number;
  title: string;
  amount: number | string;
  threshold: number | string;
  status: number;
}

export default function MarketingPage() {
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState({ title: '', amount: '', threshold: '' });
  const [topic, setTopic] = useState('新品辣椒炒肉');
  const [copy, setCopy] = useState('');
  const [generating, setGenerating] = useState(false);

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    load();
  }, []);

  async function load() {
    const res = await fetch('/api/coupons', { headers: authHeaders() });
    const data = await res.json();
    setCoupons(Array.isArray(data) ? data : []);
  }

  async function createCoupon() {
    if (!form.title || !form.amount) return;
    const res = await fetch('/api/coupons', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        amount: Number(form.amount),
        threshold: Number(form.threshold || 0),
      }),
    });
    if (res.ok) {
      setForm({ title: '', amount: '', threshold: '' });
      load();
    } else {
      alert('创建失败');
    }
  }

  async function removeCoupon(id: number) {
    if (!confirm('确定删除该优惠券吗？')) return;
    const res = await fetch(`/api/coupons/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) load();
  }

  async function generateCopy() {
    if (!topic) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `我是商家，帮我写一条「${topic}」的推广文案，要求：有吸引力、不超过 100 字、含活动引导。`,
          sessionId: 'merchant-copy',
        }),
      });
      const data = await res.json();
      setCopy(data.response || '生成失败');
    } catch {
      setCopy('AI 服务暂时不可用');
    } finally {
      setGenerating(false);
    }
  }

  return (
<div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
<h1 className="atitle mb-6">📣 营销中心</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 优惠券 */}
          <div className="apanel">
            <h2 className="text-lg font-semibold mb-4">优惠券管理</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="券名称，如：满50减10"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
              />
              <input
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="面额"
                type="number"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg"
              />
              <input
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                placeholder="门槛"
                type="number"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg"
              />
              <button
                onClick={createCoupon}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                创建
              </button>
            </div>
            <div className="space-y-2">
              {coupons.map((c) => (
                <div key={c.id} className="flex justify-between items-center bg-orange-50 rounded-lg px-4 py-3">
                  <div>
                    <div className="font-medium text-sm">{c.title}</div>
                    <div className="text-xs text-gray-500">
                      满 ¥{Number(c.threshold).toFixed(2)} 减 ¥{Number(c.amount).toFixed(2)}
                    </div>
                  </div>
                  <button onClick={() => removeCoupon(c.id)} className="text-red-500 text-sm hover:underline">
                    删除
                  </button>
                </div>
              ))}
              {coupons.length === 0 && <p className="text-gray-400 text-sm">暂无优惠券</p>}
            </div>
          </div>

          {/* AI 文案生成 */}
          <div className="apanel">
            <h2 className="text-lg font-semibold mb-4">🤖 AI 推广文案</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="推广主题，如：新品辣椒炒肉"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
              />
              <button
                onClick={generateCopy}
                disabled={generating}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {generating ? '生成中...' : '生成文案'}
              </button>
            </div>
            <textarea
              value={copy}
              readOnly
              placeholder="生成的文案会显示在这里"
              className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
