'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getLocalCart,
  removeFromLocalCart,
  updateLocalCartQty,
  type GuestCartItem,
} from '@/lib/cart-storage';
import { CustomerNav, NavBackLink } from '@/components/CustomerNav';
import { EmptyState } from '@/components/EmptyState';
import { CompactDishRow } from '@/components/CompactDishRow';

interface CartItem {
  id: number;
  name: string;
  number: number;
  amount: number | string;
  dishId?: number | null;
}

interface MyCoupon {
  id: number;
  status: number;
  coupon?: { id: number; title: string; amount: number | string; threshold: number | string };
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [coupons, setCoupons] = useState<MyCoupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<number | ''>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // 标记当前 items 来自 localStorage(用于调整数量/删除走本地路径,不走后端)
  const [isLocal, setIsLocal] = useState(false);

  const customerHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${localStorage.getItem('customerToken')}`,
  });

  useEffect(() => {
    const token = localStorage.getItem('customerToken');
    if (!token) {
      // 未登录:从 localStorage 读暂存购物车
      setIsLoggedIn(false);
      setIsLocal(true);
      setItems(mapGuestToCartItems(getLocalCart()));
      setLoading(false);
      return;
    }
    setIsLoggedIn(true);
    setIsLocal(false);
    load();
  }, []);

  function mapGuestToCartItems(guest: GuestCartItem[]): CartItem[] {
    return guest.map((g) => ({
      id: g.dishId,
      dishId: g.dishId,
      name: g.name,
      number: g.number,
      amount: Number(g.price) * g.number,
    }));
  }

  async function load() {
    try {
      const [cartRes, couponRes] = await Promise.all([
        fetch('/go/cart', { headers: customerHeaders() }),
        fetch('/api/customer/coupons', {
          headers: { Authorization: `Bearer ${localStorage.getItem('customerToken')}` },
        }),
      ]);
      const data = await cartRes.json();
      const myCoupons = await couponRes.json();
      setItems(data.data || []);
      setCoupons((myCoupons || []).filter((c: MyCoupon) => c.status === 0));
    } catch (e) {
      setError('加载购物车失败');
    } finally {
      setLoading(false);
    }
  }

  // 本地购物车的增删(未登录状态)
  function changeLocalQty(dishId: number, delta: number) {
    const cur = items.find((i) => i.dishId === dishId);
    if (!cur) return;
    const next = Math.max(0, cur.number + delta);
    updateLocalCartQty(dishId, next);
    setItems(mapGuestToCartItems(getLocalCart()));
  }

  function removeLocalItem(dishId: number) {
    removeFromLocalCart(dishId);
    setItems(mapGuestToCartItems(getLocalCart()));
  }

  const total = items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const selectedCoupon = coupons.find((c) => c.id === selectedCouponId);
  const discount =
    selectedCoupon && total >= Number(selectedCoupon.coupon?.threshold || 0)
      ? Math.min(Number(selectedCoupon.coupon?.amount || 0), total)
      : 0;
  const payable = total - discount;

  async function checkout() {
    // 未登录:跳登录页,登录成功后由 login 页把本地购物车合并到服务端
    if (!isLoggedIn) {
      router.push('/account/login');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const headers = customerHeaders();
      // 1. 取当前 JWT 顾客的默认地址
      const addrRes = await fetch('/go/addresses', { headers });
      const addrData = await addrRes.json();
      const address = (addrData.data || [])[0];
      if (!address) throw new Error('没有收货地址，请先注册完整信息');

      // 2. 提交订单
      const orderRes = await fetch('/go/orders/submit', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addressBookId: address.id,
          remark: '',
          payMethod: 1,
          couponId: selectedCouponId || undefined,
        }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || '下单失败');

      // 3. 支付
      const payRes = await fetch('/go/payment/pay', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: orderData.data.orderNumber, payMethod: 1 }),
      });
      const payData = await payRes.json();
      if (!payRes.ok) throw new Error(payData.error || '支付失败');

      router.push('/account?tab=orders');
    } catch (e: any) {
      setError(e.message || '下单失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="frosted sticky top-0 z-40">
        <div className="container mx-auto px-4 min-h-14 py-2.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🍜</span>
            <span className="serif text-xl font-semibold" style={{ color: 'var(--accent)' }}>购物车</span>
          </Link>
          <Link href="/" className="text-sm" style={{ color: 'var(--muted)' }}>
            ← 继续点餐
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6">
        {loading ? (
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
                    isLocal && item.dishId ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => changeLocalQty(item.dishId!, -1)}
                          className="w-7 h-7 rounded-full border text-sm"
                          style={{ borderColor: 'var(--border)' }}
                          aria-label="减少"
                        >−</button>
                        <button
                          onClick={() => changeLocalQty(item.dishId!, 1)}
                          className="w-7 h-7 rounded-full border text-sm"
                          style={{ borderColor: 'var(--border)' }}
                          aria-label="增加"
                        >+</button>
                        <button
                          onClick={() => removeLocalItem(item.dishId!)}
                          className="ml-1 text-xs px-2 py-1 rounded"
                          style={{ color: 'var(--danger)' }}
                          aria-label="删除"
                        >删除</button>
                      </div>
                    ) : undefined
                  }
                />
              ))}
              <div className="p-4 flex items-center justify-between rounded-b-xl" style={{ background: 'var(--bg-deep)' }}>
                <span style={{ color: 'var(--muted)' }}>合计</span>
                <span className="mono text-xl font-semibold" style={{ color: 'var(--accent)' }}>¥{total.toFixed(2)}</span>
              </div>
            </div>

            {coupons.length > 0 && (
              <div className="xcard p-4 mt-4">
                <div className="text-sm font-medium text-gray-700 mb-2">🎟️ 使用优惠券</div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="radio"
                      name="coupon"
                      checked={selectedCouponId === ''}
                      onChange={() => setSelectedCouponId('')}
                    />
                    不使用优惠券
                  </label>
                  {coupons.map((c) => {
                    const usable = total >= Number(c.coupon?.threshold || 0);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2 text-sm text-gray-600 ${usable ? '' : 'opacity-50'}`}
                      >
                        <input
                          type="radio"
                          name="coupon"
                          disabled={!usable}
                          checked={selectedCouponId === c.id}
                          onChange={() => setSelectedCouponId(c.id)}
                        />
                        {c.coupon?.title}（满 ¥{Number(c.coupon?.threshold || 0).toFixed(2)} 减 ¥
                        {Number(c.coupon?.amount || 0).toFixed(2)}）
                        {!usable && <span className="text-xs text-gray-400">未达门槛</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {discount > 0 && (
              <div className="flex justify-between text-sm mt-3 px-1" style={{ color: 'var(--fg-soft)' }}>
                <span>优惠券抵扣</span>
                <span className="text-green-600">-¥{discount.toFixed(2)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-sm font-medium mt-1 px-1">
                <span>应付</span>
                <span className="mono font-semibold" style={{ color: 'var(--accent)' }}>¥{payable.toFixed(2)}</span>
              </div>
            )}

            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

            <button
              onClick={checkout}
              disabled={submitting}
              className="pill pill-accent w-full !h-14 !text-base"
            >
              {submitting ? '正在下单并支付...' : isLoggedIn ? '去结算' : '登录并结算'}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
