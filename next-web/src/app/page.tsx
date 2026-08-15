'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Dish {
  id: number;
  name: string;
  categoryId: number;
  price: number | string;
  image?: string;
  description?: string;
  rating?: number;
  sales?: number;
  status: number;
}

interface Category {
  id: number;
  name: string;
}

const T = {
  zh: {
    brand: '星选 AI 购物管家',
    eyebrow: 'AI Shopping Companion',
    tagline: '想吃点什么？跟 AI 说就行',
    sub: '智能推荐 · 自然语言下单 · 凑单比价 · 真实评价数据',
    cta: '🤖 开始 AI 点餐',
    bargainTitle: '预算凑单',
    bargainPlaceholder: '输入预算，如 50',
    bargainBtn: '帮我凑单',
    menu: '今日菜单',
    menuSub: '真实评分与月销，全部可加入购物车',
    empty: '这个分类暂时没有菜品',
  },
  en: {
    brand: 'StarSelect AI Shopping',
    eyebrow: 'AI Shopping Companion',
    tagline: 'What do you want to eat?',
    sub: 'AI Recommend · Order by Chat · Bargain · Real Reviews',
    cta: '🤖 Start AI Ordering',
    bargainTitle: 'Budget Combo',
    bargainPlaceholder: 'Budget, e.g. 50',
    bargainBtn: 'Find best combo',
    menu: 'Today\'s Menu',
    menuSub: 'Real ratings & sales. Add to cart.',
    empty: 'No dishes in this category',
  },
};

export default function HomePage() {
  const router = useRouter();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [toast, setToast] = useState('');
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [budget, setBudget] = useState('');
  const [bargainRes, setBargainRes] = useState<{
    total: number;
    items: { dishId: number; name: string; price: number }[];
  } | null>(null);
  const [bargainLoading, setBargainLoading] = useState(false);
  const [priceHistory, setPriceHistory] = useState<{ timestamp: number; price: number }[]>([]);
  const [availableCoupons, setAvailableCoupons] = useState<
    { id: number; title: string; amount: number | string; threshold: number | string }[]
  >([]);
  const [claimedIds, setClaimedIds] = useState<number[]>([]);

  const i18n = T[lang];

  useEffect(() => {
    // 每次回到页面（含浏览器返回缓存/切回标签页）都重新检查登录状态
    const checkLogin = () => setIsLoggedIn(!!localStorage.getItem('customerToken'));
    checkLogin();
    window.addEventListener('storage', checkLogin);
    window.addEventListener('focus', checkLogin);
    window.addEventListener('pageshow', checkLogin);
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'zh') setLang(saved);
    if (localStorage.getItem('customerToken')) {
      loadCoupons();
    }
    async function load() {
      try {
        const cached = sessionStorage.getItem('menu_cache');
        if (cached) {
          const c = JSON.parse(cached);
          if (c.dishes?.length) setDishes(c.dishes);
          if (c.categories?.length) setCategories(c.categories);
        }
        const [dishRes, catRes] = await Promise.all([
          fetch('/api/dishes').then((r) => r.json()),
          fetch('/api/categories').then((r) => r.json()),
        ]);
        setDishes(dishRes?.data || []);
        setCategories(catRes?.data || []);
        sessionStorage.setItem(
          'menu_cache',
          JSON.stringify({ dishes: dishRes?.data || [], categories: catRes?.data || [] }),
        );
      } catch (e) {
        console.error('加载菜单失败', e);
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => {
      window.removeEventListener('storage', checkLogin);
      window.removeEventListener('focus', checkLogin);
      window.removeEventListener('pageshow', checkLogin);
    };
  }, []);

  async function loadCoupons() {
    const token = localStorage.getItem('customerToken');
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [availRes, mineRes] = await Promise.all([
        fetch('/api/customer/coupons/available', { headers }),
        fetch('/api/customer/coupons', { headers }),
      ]);
      const avail = await availRes.json();
      const mine = await mineRes.json();
      setAvailableCoupons(Array.isArray(avail) ? avail : []);
      setClaimedIds((mine || []).map((m: any) => m.couponId));
    } catch {}
  }

  async function claimCoupon(couponId: number) {
    const token = localStorage.getItem('customerToken');
    if (!token) {
      router.push('/account/login');
      return;
    }
    try {
      const res = await fetch('/api/customer/coupons/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ couponId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '领取失败');
      setToast('领取成功！去购物车结算时可用');
      setTimeout(() => setToast(''), 2500);
      loadCoupons();
    } catch (e: any) {
      setToast(e.message || '领取失败');
      setTimeout(() => setToast(''), 2500);
    }
  }

  const filtered =
    activeCategory === 'all'
      ? dishes
      : dishes.filter((d) => d.categoryId === activeCategory);

  async function openDish(dish: Dish) {
    setSelectedDish(dish);
    setPriceHistory([]);
    const token = localStorage.getItem('customerToken');
    if (token) {
      fetch('/api/customer/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dishId: dish.id }),
      }).catch(() => {});
      fetch(`/go/dishes/${dish.id}/price-history`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => setPriceHistory(d?.data || []))
        .catch(() => {});
    }
  }

  async function addToCart(dish: Dish) {
    const token = localStorage.getItem('customerToken');
    if (!token) {
      router.push('/account/login');
      return;
    }
    try {
      const res = await fetch('/go/cart/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dishId: dish.id, number: 1 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || '添加失败');
      }
      setToast(`「${dish.name}」已加入购物车`);
      setTimeout(() => setToast(''), 2000);
    } catch (e: any) {
      setToast(e.message || '添加失败，请重试');
      setTimeout(() => setToast(''), 2500);
    }
  }

  async function bargain() {
    const b = Number(budget);
    if (!b || b <= 0) return;
    setBargainLoading(true);
    try {
      const res = await fetch('/api/ai/bargain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget: b }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '凑单失败');
      setBargainRes(data);
    } catch (e: any) {
      setToast(e.message || '凑单失败');
      setTimeout(() => setToast(''), 2500);
    } finally {
      setBargainLoading(false);
    }
  }

  async function addBargainToCart() {
    if (!bargainRes) return;
    const token = localStorage.getItem('customerToken');
    if (!token) {
      router.push('/account/login');
      return;
    }
    for (const item of bargainRes.items) {
      await fetch('/go/cart/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dishId: item.dishId, number: 1 }),
      }).catch(() => {});
    }
    setToast('已加入购物车');
    setTimeout(() => setToast(''), 2000);
  }

  function switchLang() {
    const next = lang === 'zh' ? 'en' : 'zh';
    setLang(next);
    localStorage.setItem('lang', next);
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* 磨砂导航 */}
      <header className="frosted sticky top-0 z-40">
        <div className="shell max-w-6xl mx-auto px-4 md:px-8 min-h-16 py-3 flex flex-wrap items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🍜</span>
            <span className="serif text-xl font-semibold" style={{ color: 'var(--accent)' }}>
              {i18n.brand}
            </span>
          </Link>
          <div className="flex items-center gap-1.5 md:gap-2">
            {isLoggedIn ? (
              <Link href="/account" className="pill pill-ghost !h-9 !px-4 !text-[13px]">
                我的
              </Link>
            ) : (
              <Link href="/account/login" className="pill pill-ghost !h-9 !px-4 !text-[13px]">
                登录/注册
              </Link>
            )}
            <Link href="/cart" className="pill pill-ghost !h-9 !px-4 !text-[13px]">
              🛒 购物车
            </Link>
            <button
              onClick={switchLang}
              className="pill pill-soft !h-9 !px-4 !text-[13px]"
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 md:px-8 pt-14 pb-10 text-center">
        <div className="eyebrow mb-4">{i18n.eyebrow}</div>
        <h1 className="cjk-display text-4xl md:text-6xl font-semibold mb-5" style={{ color: 'var(--fg)' }}>
          {i18n.tagline}
        </h1>
        <p className="text-base md:text-lg mb-8" style={{ color: 'var(--muted)' }}>
          {i18n.sub}
        </p>
        <Link
          href="/assistant"
          className="pill pill-accent px-8 !h-14 !text-base shadow-lg"
        >
          {i18n.cta}
        </Link>
        <div className="flex justify-center gap-6 mt-8 text-sm" style={{ color: 'var(--muted)' }}>
          <span>⭐ 真实评分数据</span>
          <span>🛒 下单即达</span>
          <span>🎟️ 领券立减</span>
        </div>
      </section>

      {/* 预算凑单 */}
      <section className="px-4 md:px-8 pb-6">
        <div className="xcard p-6 max-w-2xl mx-auto">
          <h2 className="font-semibold mb-3">💰 {i18n.bargainTitle}</h2>
          <div className="flex gap-2">
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder={i18n.bargainPlaceholder}
              type="number"
              className="flex-1 px-4 py-2.5 rounded-full border"
              style={{ borderColor: 'var(--border)' }}
            />
            <button onClick={bargain} disabled={bargainLoading} className="pill pill-accent">
              {bargainLoading ? '...' : i18n.bargainBtn}
            </button>
          </div>
          {bargainRes && bargainRes.items.length > 0 && (
            <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--bg-deep)' }}>
              <div className="flex justify-between text-sm font-medium mb-2">
                <span>最优组合</span>
                <span className="mono" style={{ color: 'var(--accent)' }}>
                  合计 ¥{bargainRes.total.toFixed(2)}
                </span>
              </div>
              <div className="space-y-1 mb-3 text-sm" style={{ color: 'var(--fg-soft)' }}>
                {bargainRes.items.map((item) => (
                  <div key={item.dishId} className="flex justify-between">
                    <span>{item.name}</span>
                    <span className="mono">¥{item.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <button onClick={addBargainToCart} className="pill pill-accent w-full !h-11">
                一键加入购物车
              </button>
            </div>
          )}
          {bargainRes && bargainRes.items.length === 0 && (
            <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
              预算不足，点不起任何菜
            </p>
          )}
        </div>
      </section>

      {/* 领券中心 */}
      {isLoggedIn && availableCoupons.length > 0 && (
        <section className="px-4 md:px-8 pb-6">
          <div className="xcard p-6 max-w-2xl mx-auto">
            <h2 className="font-semibold mb-3">🎟️ 领券中心</h2>
            <div className="space-y-2">
              {availableCoupons.map((c) => {
                const claimed = claimedIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{ background: 'var(--bg-deep)' }}
                  >
                    <div>
                      <div className="font-medium text-sm">{c.title}</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        满 ¥{Number(c.threshold).toFixed(2)} 减 ¥{Number(c.amount).toFixed(2)}
                      </div>
                    </div>
                    <button
                      onClick={() => claimCoupon(c.id)}
                      disabled={claimed}
                      className={`pill !h-9 !px-5 !text-[13px] ${
                        claimed ? 'pill-soft opacity-60' : 'pill-accent'
                      }`}
                    >
                      {claimed ? '已领取' : '领取'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 菜单 */}
      <section className="px-4 md:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <div className="eyebrow mb-2">Menu</div>
            <h2 className="cjk-display text-3xl font-semibold">{i18n.menu}</h2>
            <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
              {i18n.menuSub}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mb-8">
            <button
              onClick={() => setActiveCategory('all')}
              className={`pill !h-9 !px-5 !text-[13px] ${
                activeCategory === 'all' ? 'pill-accent' : 'pill-soft'
              }`}
            >
              全部
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`pill !h-9 !px-5 !text-[13px] ${
                  activeCategory === c.id ? 'pill-accent' : 'pill-soft'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
              菜单加载中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
              {i18n.empty}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((dish, idx) => (
                <div
                  key={dish.id}
                  onClick={() => openDish(dish)}
                  className="xcard overflow-hidden cursor-pointer hover:shadow-lg transition-shadow rise"
                  style={{ animationDelay: `${Math.min(idx * 60, 400)}ms` }}
                >
                  <div
                    className="grid place-items-center text-5xl mx-3 mt-3 rounded-lg"
                    style={{
                      aspectRatio: '4 / 3',
                      background: 'var(--bg-deep)',
                      borderRadius: 10,
                    }}
                  >
                    🍽️
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <h3 className="serif text-xl font-semibold">{dish.name}</h3>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        月销 {dish.sales ?? 0}
                      </span>
                    </div>
                    <p
                      className="text-sm mt-1 mb-3 min-h-[20px] truncate"
                      style={{ color: 'var(--muted)' }}
                    >
                      {dish.description || '暂无描述'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="mono text-xl font-semibold" style={{ color: 'var(--accent)' }}>
                        ¥{Number(dish.price).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm" style={{ color: 'var(--warn)' }}>
                          ⭐ {dish.rating ?? '4.5'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(dish);
                          }}
                          className="pill pill-accent !h-9 !px-4 !text-[13px]"
                        >
                          加入购物车
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 菜品详情弹窗 */}
      {selectedDish && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDish(null)}
        >
          <div className="xcard max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <span className="text-5xl">🍽️</span>
              <button onClick={() => setSelectedDish(null)} className="text-lg" style={{ color: 'var(--muted)' }}>
                ✕
              </button>
            </div>
            <h3 className="serif text-2xl font-semibold mb-2">{selectedDish.name}</h3>
            <p className="mb-4" style={{ color: 'var(--muted)' }}>
              {selectedDish.description || '暂无描述'}
            </p>
            <div className="flex items-center justify-between">
              <span className="mono text-2xl font-semibold" style={{ color: 'var(--accent)' }}>
                ¥{Number(selectedDish.price).toFixed(2)}
              </span>
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                ⭐ {selectedDish.rating ?? '4.5'} · 月销 {selectedDish.sales ?? 0}
              </div>
            </div>
            {priceHistory.length > 0 && (
              <div className="mt-5">
                <div className="text-sm mb-2" style={{ color: 'var(--muted)' }}>
                  📈 近 90 天价格走势
                </div>
                <PriceChart data={priceHistory} />
              </div>
            )}
            <div className="mt-6">
              <Link href="/assistant" className="pill pill-accent w-full">
                让 AI 帮我下单
              </Link>
            </div>
          </div>
        </div>
      )}

      <footer className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
        星选 AI 购物管家 · 真实数据驱动的电商 Agent 演示项目
      </footer>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-3 rounded-full text-sm shadow-lg z-50 text-white"
          style={{ background: 'var(--fg)' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function PriceChart({ data }: { data: { timestamp: number; price: number }[] }) {
  const W = 480;
  const H = 120;
  const pad = 8;
  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const points = data
    .map((d, i) => {
      const x = pad + (i / Math.max(1, data.length - 1)) * (W - pad * 2);
      const y = H - pad - ((d.price - min) / range) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = data[data.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28">
        <polyline points={points} fill="none" stroke="#c24a1c" strokeWidth="2" strokeLinecap="round" />
        <circle
          cx={W - pad}
          cy={H - pad - ((last.price - min) / range) * (H - pad * 2)}
          r="3"
          fill="#c24a1c"
        />
      </svg>
      <div className="flex justify-between text-[11px]" style={{ color: 'var(--muted)' }}>
        <span>{new Date(data[0].timestamp * 1000).toLocaleDateString('zh-CN')}</span>
        <span>
          最新 ¥{last.price.toFixed(2)} · 最低 ¥{min.toFixed(2)}
        </span>
        <span>{new Date(last.timestamp * 1000).toLocaleDateString('zh-CN')}</span>
      </div>
    </div>
  );
}
