'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CustomerNav, NavBackLink } from '@/components/CustomerNav';
import { EmptyState } from '@/components/EmptyState';
import { CompactDishRow } from '@/components/CompactDishRow';
import { useCartQuery, useCustomerCouponsQuery, queryKeys } from '@/lib/queries';
import { useCustomerGuard } from '@/lib/guards';
import { useAuthStore, useCartStore } from '@/lib/stores';
import { useToast } from '@/lib/use-toast';
import api from '@/lib/api';

interface CartItem {
  id: number;
  name: string;
  number: number;
  amount: number | string;
  dishId?: number | null;
}

function guestToCart(items: ReturnType<typeof useCartStore.getState>['items']): CartItem[] {
  return items.map((g) => ({
    id: g.dishId,
    dishId: g.dishId,
    name: g.name,
    number: g.number,
    amount: Number(g.price) * g.number,
  }));
}

export default function CartPage() {
  const router = useRouter();
  const guardOk = useCustomerGuard();
  const customerToken = useAuthStore((s) => s.customerToken);
  const isLoggedIn = !!customerToken;
  const guestItems = useCartStore((s) => s.items);
  const removeGuest = useCartStore((s) => s.remove);
  const updateGuestQty = useCartStore((s) => s.updateQty); // delta 语义: +1 / -1
  const toast = useToast();
  const queryClient = useQueryClient();

  const cartQuery = useCartQuery(isLoggedIn);
  const couponsQuery = useCustomerCouponsQuery();
  const coupons = (couponsQuery.data || []).filter((c) => c.status === 0);

  const serverItems = (cartQuery.data || []) as CartItem[];
  const items = isLoggedIn ? serverItems : guestToCart(guestItems);
  const loading = isLoggedIn ? cartQuery.isLoading : false;

  const [selectedCouponId, setSelectedCouponId] = useState<number | ''>('');

  const total = items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const selectedCoupon = coupons.find((c) => c.id === selectedCouponId);
  const discount =
    selectedCoupon && total >= Number(selectedCoupon.coupon?.threshold || 0)
      ? Math.min(Number(selectedCoupon.coupon?.amount || 0), total)
      : 0;
  const payable = total - discount;

  const checkout = useMutation({
    mutationFn: async () => {
      const addrRes = await api.get('/go/addresses');
      const addrData: any = addrRes.data;
      const address = (addrData?.data || addrData || [])[0];
      if (!address) throw new Error('没有收货地址，请先注册完整信息');
      const orderRes = await api.post('/go/orders/submit', {
        addressBookId: address.id,
        remark: '',
        payMethod: 1,
        couponId: selectedCouponId || undefined,
      });
      const orderData: any = orderRes.data;
      if (!orderRes.status.toString().startsWith('2')) throw new Error(orderData?.error || '下单失败');
      const orderNumber = orderData?.data?.orderNumber || orderData?.orderNumber;
      if (!orderNumber) throw new Error('未返回订单号');
      const payRes = await api.post('/go/payment/pay', { orderNumber, payMethod: 1 });
      const payData: any = payRes.data;
      if (!payRes.status.toString().startsWith('2')) throw new Error(payData?.error || '支付失败');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      router.push('/account?tab=orders');
    },
    onError: (e: any) => toast.show(e?.message || '下单失败，请重试'),
  });

  function onCheckout() {
    if (!isLoggedIn) {
      router.push('/account/login');
      return;
    }
    checkout.mutate();
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="frosted sticky top-0 z-40">
        <div className="container mx-auto px-4 min-h-14 py-2.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🍜</span>
            <span className="serif text-xl font-semibold" style={{ color: 'var(--accent)' }}>购物车</span>
          </Link>
          <Link href="/" className="text-sm" style={{ color: 'var(--muted)' }}>← 继续点餐</Link>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6">
        {loading || !guardOk ? (
          <div className="text-center py-16" style={{ color: 'var(--muted)' }}>加载中...</div>
        ) : !isLoggedIn && items.length === 0 ? (
          <EmptyState icon="🛒" text="购物车空空，去首页看看" href="/" ctaLabel="去点餐 →" />
        ) : (
          <>
            {!isLoggedIn && (
              <div className="xcard p-3 mb-4 text-sm flex items-center gap-2" style={{ background: 'var(--bg-deep)' }}>
                <span>🔒</span>
                <span style={{ color: 'var(--fg-soft)' }}>
                  以下商品暂存在本机，登录后将自动合并到您的购物车
                </span>
              </div>
            )}
            <div className="xcard divide-y" style={{ borderColor: 'var(--border)' }}>
              {items.map((item) => (
                <CompactDishRow
                  key={item.id}
                  name={item.name}
                  number={item.number}
                  amount={item.amount}
                  rightSlot={
                    !isLoggedIn && item.dishId ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateGuestQty(item.dishId!, -1)} className="w-7 h-7 rounded-full border text-sm" style={{ borderColor: 'var(--border)' }} aria-label="减少">−</button>
                        <button onClick={() => updateGuestQty(item.dishId!, 1)} className="w-7 h-7 rounded-full border text-sm" style={{ borderColor: 'var(--border)' }} aria-label="增加">+</button>
                        <button onClick={() => removeGuest(item.dishId!)} className="ml-1 text-xs px-2 py-1 rounded" style={{ color: 'var(--danger)' }} aria-label="删除">删除</button>
                      </div>
                    ) : undefined
                  }
                />
              ))}
            </div>

            {isLoggedIn && coupons.length > 0 && (
              <div className="xcard p-4 mt-4">
                <div className="text-sm font-medium mb-2">可用优惠券</div>
                <select
                  value={selectedCouponId}
                  onChange={(e) => setSelectedCouponId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border rounded-lg"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option value="">不使用优惠券</option>
                  {coupons.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.coupon?.title} (满 ¥{Number(c.coupon?.threshold || 0).toFixed(2)} 减 ¥{Number(c.coupon?.amount || 0).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="xcard p-4 mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>合计</span>
                <span>¥{total.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm" style={{ color: 'var(--accent)' }}>
                  <span>优惠券抵扣</span>
                  <span>- ¥{discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span>应付</span>
                <span style={{ color: 'var(--accent)' }}>¥{payable.toFixed(2)}</span>
              </div>
              <button
                disabled={checkout.isPending || items.length === 0}
                onClick={onCheckout}
                className="pill pill-accent w-full !h-12 mt-3 disabled:opacity-50"
              >
                {checkout.isPending ? '处理中...' : isLoggedIn ? '提交订单并支付' : '登录后下单'}
              </button>
              {toast.message && <p className="text-sm text-red-500">{toast.message}</p>}
            </div>
          </>
        )}
      </main>

      <CustomerNav rightSlot={<NavBackLink label="← 继续点餐" />} />
    </div>
  );
}