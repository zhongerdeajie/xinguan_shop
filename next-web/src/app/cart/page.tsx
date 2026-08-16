'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

  const customerHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${localStorage.getItem('customerToken')}`,
  });

  useEffect(() => {
    const token = localStorage.getItem('customerToken');
    if (!token) {
      setIsLoggedIn(false);
      setLoading(false);
      return;
    }
    setIsLoggedIn(true);
    load();
  }, []);

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

  const total = items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const selectedCoupon = coupons.find((c) => c.id === selectedCouponId);
  const discount =
    selectedCoupon && total >= Number(selectedCoupon.coupon?.threshold || 0)
      ? Math.min(Number(selectedCoupon.coupon?.amount || 0), total)
      : 0;
  const payable = total - discount;

  async function checkout() {
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
        ) : !isLoggedIn ? (
          <div className="text-center py-16 xcard">
            <div className="text-4xl mb-3">🛒</div>
            <p className="mb-4" style={{ color: 'var(--muted)' }}>登录后可查看购物车</p>
            <Link href="/account/login" className="pill pill-accent !h-10 !px-6 inline-block">去登录</Link>
            <div className="mt-3">
              <Link href="/" className="text-sm" style={{ color: 'var(--muted)' }}>暂不登录，继续浏览 →</Link>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 xcard">
            <div className="text-4xl mb-3">🛒</div>
            <p className="mb-4" style={{ color: 'var(--muted)' }}>购物车空空，去首页看看</p>
            <Link href="/" className="pill pill-accent !h-10 !px-6 inline-block">去点餐 →</Link>
          </div>
        ) : (
          <>
            <div className="xcard divide-y" style={{ borderColor: 'var(--border)' }}>
              {items.map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{item.name}</div>
                  <div className="text-sm" style={{ color: 'var(--muted)' }}>× {item.number}</div>
                  </div>
                  <div className="mono font-semibold" style={{ color: 'var(--accent)' }}>
                    ¥{Number(item.amount).toFixed(2)}
                  </div>
                </div>
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
              {submitting ? '正在下单并支付...' : '去结算'}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
