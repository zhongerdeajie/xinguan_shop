'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import { useCouponsQuery, useCouponMutations } from '@/lib/queries';
import { useAdminGuard } from '@/lib/guards';
import { marketingAPI } from '@/lib/api';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/lib/use-toast';

export default function MarketingPage() {
  useAdminGuard();
  const { data: coupons = [] } = useCouponsQuery();
  const { create, remove } = useCouponMutations();
  const toast = useToast();

  const [form, setForm] = useState({ title: '', amount: '', threshold: '' });
  const [topic, setTopic] = useState('新品辣椒炒肉');
  const [copy, setCopy] = useState('');
  const generate = useMutation({
    mutationFn: (t: string) => marketingAPI.generateCopy(t).then((r: any) => r?.data?.response || r?.data || '生成失败'),
    onSuccess: (text: string) => {
      setCopy(text);
      toast.show('文案已生成');
    },
    onError: () => {
      setCopy('AI 服务暂时不可用');
      toast.show('生成失败');
    },
  });

  async function onCreate() {
    if (!form.title || !form.amount) return;
    try {
      await create.mutateAsync({
        title: form.title,
        amount: Number(form.amount),
        threshold: Number(form.threshold || 0),
      });
      setForm({ title: '', amount: '', threshold: '' });
      toast.show('已创建');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || '创建失败');
    }
  }

  async function onRemove(id: number) {
    if (!confirm('确定删除该优惠券吗？')) return;
    try {
      await remove.mutateAsync(id);
      toast.show('已删除');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || '删除失败');
    }
  }

  return (
    <div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <h1 className="atitle mb-6">📣 营销中心</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <button onClick={onCreate} disabled={create.isPending} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
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
                  <button onClick={() => onRemove(c.id)} disabled={remove.isPending} className="text-red-500 text-sm hover:underline">
                    删除
                  </button>
                </div>
              ))}
              {coupons.length === 0 && <p className="text-gray-400 text-sm">暂无优惠券</p>}
            </div>
          </div>

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
                onClick={() => generate.mutate(topic)}
                disabled={generate.isPending || !topic}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {generate.isPending ? '生成中...' : '生成文案'}
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