'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { EmptyState } from '@/components/EmptyState';
import {
  useCustomerProfileQuery,
  useCustomerOrdersQuery,
  useCustomerHistoryQuery,
  useCustomerChatQuery,
  useCustomerCouponsQuery,
} from '@/lib/queries';
import { useCustomerGuard } from '@/lib/guards';
import { useAuthStore } from '@/lib/stores';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { useToast } from '@/lib/use-toast';
import type { Order } from '@/types';

type Tab = 'orders' | 'browse' | 'chat' | 'coupons';
const VALID_TABS: Tab[] = ['orders', 'browse', 'chat', 'coupons'];

const STATUS_TEXT: Record<number, string> = {
  1: '待付款',
  2: '待接单',
  3: '已接单',
  4: '派送中',
  5: '已完成',
  6: '已取消',
};

export default function AccountPage() {
  const router = useRouter();
  const guardOk = useCustomerGuard();
  const clearCustomerAuth = useAuthStore((s) => s.clearCustomerAuth);
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('orders');
  const { data: profile } = useCustomerProfileQuery();
  const ordersQuery = useCustomerOrdersQuery();
  const historyQuery = useCustomerHistoryQuery();
  const chatQuery = useCustomerChatQuery();
  const couponsQuery = useCustomerCouponsQuery();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab && (VALID_TABS as string[]).includes(urlTab)) {
      setTab(urlTab as Tab);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  }, [tab]);

  const refund = useMutation({
    mutationFn: (orderId: number) => api.post(`/go/payment/refund/${orderId}`),
    onSuccess: () => {
      ordersQuery.refetch();
      toast.show('退款成功，金额将原路退回');
    },
    onError: (e: any) => toast.show(e?.response?.data?.error || '退款失败'),
  });

  function logout() {
    localStorage.removeItem('customerToken');
    localStorage.removeItem('customerUser');
    clearCustomerAuth();
    router.push('/');
  }

  const orders = ordersQuery.data || [];
  const browse = historyQuery.data || [];
  const chat = chatQuery.data || [];
  const coupons = (couponsQuery.data || []).filter((c) => c.status === 0);
  const loading = guardOk && (
    ordersQuery.isLoading ||
    historyQuery.isLoading ||
    chatQuery.isLoading ||
    couponsQuery.isLoading
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="frosted">
        <div className="container mx-auto px-4 min-h-16 py-3 flex flex-wrap items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🍜</span>
            <span className="serif text-xl font-semibold" style={{ color: 'var(--accent)' }}>我的</span>
          </Link>
          <button onClick={logout} className="text-sm" style={{ color: 'var(--muted)' }}>
            退出登录
          </button>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6">
        <div className="xcard p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center text-2xl">👤</div>
            <div>
              <h1 className="serif text-xl font-semibold">{profile?.name || '顾客'}</h1>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{profile?.phone || ''}</p>
            </div>
          </div>
        </div>

        <div className="flex rounded-full p-1 mb-6 xcard">
          {(
            [
              ['orders', '🛒 我的订单'],
              ['browse', '👀 浏览记录'],
              ['chat', '💬 聊天记录'],
              ['coupons', '🎟️ 优惠券'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-full text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                tab === key ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400">加载中...</div>
        ) : tab === 'orders' ? (
          orders.length === 0 ? (
            <EmptyState icon="🛒" text="还没有订单，去 AI 点餐助手下一单吧" href="/assistant" ctaLabel="去看看 →" />
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} onRefund={(id) => refund.mutate(id)} pending={refund.isPending} />
              ))}
            </div>
          )
        ) : tab === 'browse' ? (
          browse.length === 0 ? (
            <EmptyState text="还没有浏览记录，去首页看看菜单吧" href="/" ctaLabel="去看看 →" />
          ) : (
            <div className="space-y-3">
              {browse.map((b) => (
                <div key={b.id} className="xcard p-4 flex justify-between">
                  <div>
                    <div className="font-medium">{b.dish?.name || '菜品'}</div>
                    <div className="text-sm truncate max-w-[240px]" style={{ color: 'var(--muted)' }}>
                      {b.dish?.description || '暂无描述'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono font-semibold" style={{ color: 'var(--accent)' }}>¥{Number(b.dish?.price || 0).toFixed(2)}</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      {new Date(b.viewTime).toLocaleString('zh-CN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'coupons' ? (
          coupons.length === 0 ? (
            <EmptyState icon="🎟️" text="还没有领取优惠券，去首页领券中心看看吧" href="/" ctaLabel="去看看 →" />
          ) : (
            <div className="space-y-3">
              {coupons.map((c) => (
                <div key={c.id} className="xcard p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium">{c.coupon?.title || '优惠券'}</div>
                    <div className="text-sm" style={{ color: 'var(--muted)' }}>
                      满 ¥{Number(c.coupon?.threshold || 0).toFixed(2)} 减 ¥{Number(c.coupon?.amount || 0).toFixed(2)}
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs pill-soft">未使用</span>
                </div>
              ))}
            </div>
          )
        ) : chat.length === 0 ? (
          <EmptyState icon="💬" text="还没有聊天记录，去和 AI 点餐助手聊聊吧" href="/assistant" ctaLabel="去看看 →" />
        ) : (
          <div className="space-y-3">
            {chat.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-orange-500 text-white rounded-br-md'
                      : 'bg-white border border-gray-200 rounded-bl-md'
                  }`}
                >
                  {m.intent && <div className="text-[11px] text-gray-400 mb-1">由 {m.intent} 回答</div>}
                  <MarkdownRenderer content={m.content} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function OrderRow({ order, onRefund, pending }: { order: Order; onRefund: (id: number) => void; pending: boolean }) {
  return (
    <div className="xcard p-4">
      <div className="flex justify-between text-sm mb-2">
        <span className="text-gray-500">订单号 {order.number || order.id}</span>
        <span className="font-medium" style={{ color: 'var(--accent)' }}>
          {STATUS_TEXT[order.status || 0] || `状态 ${order.status}`}
        </span>
      </div>
      <div className="text-sm space-y-1" style={{ color: 'var(--fg-soft)' }}>
        {(order.orderDetails || []).map((d, i) => (
          <div key={i}>
            {d.name} × {d.number}
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center mt-2">
        <div>
          {order.payStatus === 1 && (
            <button
              onClick={() => {
                if (confirm(`确认对订单 ${order.number || order.id} 发起退款吗？`)) onRefund(order.id);
              }}
              disabled={pending}
              className="pill !h-8 !px-4 !text-xs"
              style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }}
            >
              申请退款
            </button>
          )}
        </div>
        <div className="font-bold">¥{Number(order.amount || 0).toFixed(2)}</div>
      </div>
    </div>
  );
}