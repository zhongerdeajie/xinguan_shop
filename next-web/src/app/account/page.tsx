'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Profile {
  id: number;
  name?: string;
  phone?: string;
  createTime?: string;
}

interface Order {
  id: number;
  number?: string;
  amount?: number | string;
  status?: number;
  payStatus?: number;
  orderTime?: string;
  orderDetails?: { name?: string; number?: number; amount?: number | string }[];
}

interface BrowseItem {
  id: number;
  viewTime: string;
  dish?: { id: number; name?: string; price?: number | string; description?: string };
}

interface ChatItem {
  id: number;
  role: string;
  content: string;
  intent?: string;
  createTime: string;
}

interface MyCoupon {
  id: number;
  status: number;
  coupon?: { id: number; title: string; amount: number | string; threshold: number | string };
}

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
  const [tab, setTab] = useState<'orders' | 'browse' | 'chat' | 'coupons'>('orders');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [browse, setBrowse] = useState<BrowseItem[]>([]);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [coupons, setCoupons] = useState<MyCoupon[]>([]);
  const [loading, setLoading] = useState(true);

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('customerToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    if (!localStorage.getItem('customerToken')) {
      router.push('/account/login');
      return;
    }
    // 从 URL 参数读取 tab（如 /account?tab=chat），避免 useSearchParams 的静态生成限制
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab === 'orders' || urlTab === 'browse' || urlTab === 'chat' || urlTab === 'coupons') {
      setTab(urlTab);
    }
    load();
  }, [tab]);

  async function load() {
    setLoading(true);
    try {
      const headers = authHeaders();
      const profileRes = await fetch('/api/customer/profile', { headers });
      setProfile(await profileRes.json());
      if (tab === 'orders') {
        const res = await fetch('/api/customer/orders', { headers });
        setOrders(await res.json());
      } else if (tab === 'browse') {
        const res = await fetch('/api/customer/history', { headers });
        setBrowse(await res.json());
      } else {
        const res = await fetch('/api/customer/chat-history', { headers });
        setChat(await res.json());
      }
      if (tab === 'coupons') {
        const res = await fetch('/api/customer/coupons', { headers });
        setCoupons(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function refund(order: Order) {
    if (!confirm(`确认对订单 ${order.number || order.id} 发起退款吗？`)) return;
    const headers = authHeaders();
    try {
      const res = await fetch(`/go/payment/refund/${order.id}`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '退款失败');
      alert('退款成功，金额将原路退回');
      load();
    } catch (e: any) {
      alert(e.message || '退款失败');
    }
  }

  function logout() {
    localStorage.removeItem('customerToken');
    localStorage.removeItem('customerUser');
    router.push('/');
  }

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
            <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center text-2xl">
              👤
            </div>
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
            <Empty text="还没有订单，去 AI 点餐助手下一单吧" href="/assistant" />
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.id} className="xcard p-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">订单号 {o.number || o.id}</span>
                    <span className="font-medium" style={{ color: 'var(--accent)' }}>
                      {STATUS_TEXT[o.status || 0] || `状态 ${o.status}`}
                    </span>
                  </div>
                  <div className="text-sm space-y-1" style={{ color: 'var(--fg-soft)' }}>
                    {(o.orderDetails || []).map((d, i) => (
                      <div key={i}>
                        {d.name} × {d.number}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <div>
                      {o.payStatus === 1 && (
                        <button
                          onClick={() => refund(o)}
                          className="pill !h-8 !px-4 !text-xs"
                          style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }}
                        >
                          申请退款
                        </button>
                      )}
                    </div>
                    <div className="font-bold">¥{Number(o.amount || 0).toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'browse' ? (
          browse.length === 0 ? (
            <Empty text="还没有浏览记录，去首页看看菜单吧" href="/" />
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
            <Empty text="还没有领取优惠券，去首页领券中心看看吧" href="/" />
          ) : (
            <div className="space-y-3">
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className={`xcard p-4 flex justify-between items-center ${
                    c.status === 1 ? 'opacity-60' : ''
                  }`}
                >
                  <div>
                    <div className="font-medium">{c.coupon?.title || '优惠券'}</div>
                    <div className="text-sm" style={{ color: 'var(--muted)' }}>
                      满 ¥{Number(c.coupon?.threshold || 0).toFixed(2)} 减 ¥
                      {Number(c.coupon?.amount || 0).toFixed(2)}
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs ${
                      c.status === 1 ? 'bg-gray-200 text-gray-500' : 'pill-soft'
                    }`}
                  >
                    {c.status === 1 ? '已使用' : '未使用'}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : chat.length === 0 ? (
          <Empty text="还没有聊天记录，去和 AI 点餐助手聊聊吧" href="/assistant" />
        ) : (
          <div className="space-y-3">
            {chat.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-orange-500 text-white rounded-br-md'
                      : 'bg-white border border-gray-200 rounded-bl-md'
                  }`}
                >
                  {m.intent && <div className="text-[11px] text-gray-400 mb-1">由 {m.intent} 回答</div>}
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Empty({ text, href }: { text: string; href: string }) {
  return (
    <div className="text-center py-12 bg-white rounded-xl shadow-sm">
      <div className="text-gray-300 text-4xl mb-3">📭</div>
      <p className="text-gray-400 mb-4">{text}</p>
      <Link href={href} className="text-orange-500 text-sm font-medium">
        去看看 →
      </Link>
    </div>
  );
}
