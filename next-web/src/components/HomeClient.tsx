'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DishCard } from '@/components/DishCard';
import type { Category, Dish, DishReview } from '@/types';
import { useAuthStore, useCartStore } from '@/lib/stores';
import { useToast } from '@/lib/use-toast';
import api, { reviewsAPI } from '@/lib/api';

interface HomeClientProps {
  initialDishes: Dish[];
  initialCategories: Category[];
}

const T = {
  zh: {
    brand: '星选 AI 购物管家',
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

interface Coupon {
  id: number;
  title: string;
  amount: number | string;
  threshold: number | string;
}

interface BargainResult {
  total: number;
  items: { dishId: number; name: string; price: number }[];
}

export default function HomeClient({ initialDishes, initialCategories }: HomeClientProps) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const customerToken = useAuthStore((s) => s.customerToken);
  const isLoggedIn = !!customerToken;
  const guestAdd = useCartStore((s) => s.add);
  const guestCount = useCartStore((s) => s.items.reduce((sum, i) => sum + i.number, 0));

  // 来自 SSR 的首屏数据,客户端只把它当成"初始值"
  const [dishes] = useState<Dish[]>(initialDishes);
  const [categories] = useState<Category[]>(initialCategories);

  // 纯交互状态
  const [activeCategory, setActiveCategory] = useState<number | 'all'>('all');
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [budget, setBudget] = useState('');
  const [priceHistory, setPriceHistory] = useState<{ timestamp: number; price: number }[]>([]);

  // 评价: 当前选中菜品的评价列表 + 提交表单
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewContent, setReviewContent] = useState('');
  const [reviewAnonymous, setReviewAnonymous] = useState(false);
  const reviewsQuery = useQuery({
    queryKey: ['dish-reviews', selectedDish?.id],
    enabled: !!selectedDish,
    queryFn: async () => {
      const res: any = await reviewsAPI.listByDish(selectedDish!.id);
      return (res?.data?.data || res?.data || []) as DishReview[];
    },
  });
  const submitReview = useMutation({
    mutationFn: () =>
      reviewsAPI.create({
        dishId: selectedDish!.id,
        rating: reviewRating,
        content: reviewContent.trim(),
        isAnonymous: reviewAnonymous ? 1 : 0,
        orderId: 0, // 后端校验订单归属; 无真实订单时后端会提示"仅购买过的用户可评"
      }),
    onSuccess: () => {
      toast.show('评价成功，感谢反馈');
      setReviewContent('');
      reviewsQuery.refetch();
    },
    onError: (e: any) => {
      toast.show(e?.response?.data?.error || '评价失败');
    },
  });

  // 国际化
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  useEffect(() => {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'zh') setLang(saved);
  }, []);
  const i18n = T[lang];

  // 从订单详情"去评价"跳转进来: ?reviewDish=<id> 自动打开对应菜品评价
  useEffect(() => {
    if (typeof window === 'undefined' || dishes.length === 0) return;
    const id = Number(new URLSearchParams(window.location.search).get('reviewDish'));
    if (!id) return;
    const dish = dishes.find((d) => d.id === id);
    if (dish) {
      setSelectedDish(dish);
      // 清掉 URL 参数,避免刷新重复弹窗
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [dishes]);

  // 优惠券中心(已登录才需要)
  const couponCenter = useQuery({
    queryKey: ['coupons', 'center', customerToken],
    enabled: isLoggedIn,
    queryFn: async () => {
      const [availRes, mineRes] = await Promise.all([
        api.get('/customer/coupons/available'),
        api.get('/customer/coupons'),
      ]);
      return {
        available: Array.isArray(availRes.data) ? availRes.data : [],
        claimedIds: ((mineRes.data as any[]) || []).map((m) => m.couponId),
      } as { available: Coupon[]; claimedIds: number[] };
    },
  });
  const availableCoupons = couponCenter.data?.available || [];
  const claimedIds = couponCenter.data?.claimedIds || [];

  // 凑单
  const bargain = useMutation({
    mutationFn: async (val: number) => {
      const res = await fetch('/api/ai/bargain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget: val }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '凑单失败');
      return data as BargainResult;
    },
    onError: (e: any) => toast.show(e?.message || '凑单失败'),
  });
  const bargainRes = bargain.data || null;

  // 加车 mutation(已登录走接口;未登录直接写 store)
  const serverAdd = useMutation({
    mutationFn: (dish: Dish) =>
      api.post('/go/cart/add', { dishId: dish.id, number: 1 }),
    onSuccess: (_d, dish) => {
      queryClient.invalidateQueries({ queryKey: ['customer', 'cart'] });
      toast.show(`「${dish.name}」已加入购物车`);
    },
    onError: (e: any) => toast.show(e?.response?.data?.error || '添加失败，请重试'),
  });

  async function addToCart(dish: Dish) {
    if (!customerToken) {
      guestAdd({ dishId: dish.id, number: 1, name: dish.name, price: Number(dish.price), image: dish.image });
      toast.show(`「${dish.name}」已暂存，登录后自动加入购物车`);
      return;
    }
    serverAdd.mutate(dish);
  }

  async function addBargainToCart() {
    if (!bargainRes) return;
    if (!customerToken) {
      for (const item of bargainRes.items) {
        guestAdd({ dishId: item.dishId, number: 1, name: item.name, price: item.price });
      }
      toast.show('已暂存，登录后自动加入购物车');
      return;
    }
    for (const item of bargainRes.items) {
      await api.post('/go/cart/add', { dishId: item.dishId, number: 1 }).catch(() => undefined);
    }
    queryClient.invalidateQueries({ queryKey: ['customer', 'cart'] });
    toast.show('已加入购物车');
  }

  function openDish(dish: Dish) {
    setSelectedDish(dish);
    setPriceHistory([]);
    if (customerToken) {
      api.post('/customer/history', { dishId: dish.id }).catch(() => undefined);
      fetch(`/go/dishes/${dish.id}/price-history`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      })
        .then((r) => r.json())
        .then((d) => setPriceHistory(d?.data || []))
        .catch(() => undefined);
    }
  }

  function switchLang() {
    const next = lang === 'zh' ? 'en' : 'zh';
    setLang(next);
    localStorage.setItem('lang', next);
  }

  function claimCoupon(couponId: number) {
    if (!customerToken) {
      router.push('/account/login');
      return;
    }
    api
      .post('/customer/coupons/claim', { couponId })
      .then(() => {
        toast.show('领取成功！去购物车结算时可用');
        queryClient.invalidateQueries({ queryKey: ['coupons', 'center', customerToken] });
      })
      .catch((e: any) => toast.show(e?.response?.data?.message || '领取失败'));
  }

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const filtered =
    activeCategory === 'all'
      ? dishes
      : dishes.filter((d) => d.categoryId === activeCategory);

  const cartCount = customerToken ? 0 : guestCount;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="frosted sticky top-0 z-40">
        <div className="shell max-w-6xl mx-auto px-4 md:px-8 min-h-14 py-2.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🍜</span>
            <span className="serif text-base md:text-xl font-semibold" style={{ color: 'var(--accent)' }}>
              {i18n.brand}
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-2">
            {isLoggedIn ? (
              <Link href="/account" className="pill pill-ghost !h-9 !px-4 !text-[13px]">我的</Link>
            ) : (
              <Link href="/account/login" className="pill pill-ghost !h-9 !px-4 !text-[13px]">登录/注册</Link>
            )}
            <Link href="/cart" className="pill pill-ghost !h-9 !px-4 !text-[13px]">🛒 购物车{cartCount > 0 && `(${cartCount})`}</Link>
          </div>
          <div className="md:hidden">
            <button onClick={() => setMenuOpen(!menuOpen)} className="pill pill-ghost !h-9 !w-9 !px-0 flex items-center justify-center text-lg">☰</button>
            {menuOpen && (
              <div className="absolute right-4 mt-2 bg-white shadow-lg rounded-lg p-3 space-y-2 min-w-[160px]" style={{ background: 'var(--bg)' }}>
                {isLoggedIn ? (
                  <Link href="/account" onClick={() => setMenuOpen(false)} className="block pill pill-ghost !h-9 !px-4 !text-[13px] !w-full text-center">我的</Link>
                ) : (
                  <Link href="/account/login" onClick={() => setMenuOpen(false)} className="block pill pill-ghost !h-9 !px-4 !text-[13px] !w-full text-center">登录/注册</Link>
                )}
                <Link href="/cart" onClick={() => setMenuOpen(false)} className="block pill pill-ghost !h-9 !px-4 !text-[13px] !w-full text-center">🛒 购物车{cartCount > 0 && `(${cartCount})`}</Link>
                <Link href="/assistant" onClick={() => setMenuOpen(false)} className="block pill pill-ghost !h-9 !px-4 !text-[13px] !w-full text-center">🤖 AI点餐</Link>
              </div>
            )}
          </div>
          <button onClick={switchLang} className="pill pill-ghost !h-9 !px-3 !text-[12px]">
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
      </header>

      <section className="relative overflow-hidden px-4 md:px-8 pt-6 md:pt-10 pb-6 md:pb-8 text-center">
        <h1 className="cjk-display text-2xl md:text-4xl font-semibold mb-3" style={{ color: 'var(--fg)' }}>
          {i18n.tagline}
        </h1>
        <p className="text-sm md:text-base mb-5" style={{ color: 'var(--muted)' }}>{i18n.sub}</p>
        <Link href="/assistant" className="pill pill-accent px-6 !h-12 !text-sm shadow-lg">{i18n.cta}</Link>
      </section>

      <section className="px-4 md:px-8 pb-6">
        <div className="xcard p-6 max-w-2xl mx-auto">
          <h2 className="font-semibold mb-2">💰 {i18n.bargainTitle}</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>输入预算，AI 帮您凑单</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder={i18n.bargainPlaceholder}
              type="number"
              className="w-full sm:flex-1 px-4 py-2.5 rounded-full border"
              style={{ borderColor: 'var(--border)' }}
            />
            <button
              onClick={() => {
                const n = Number(budget);
                if (!n || n <= 0) return;
                bargain.mutate(n);
              }}
              disabled={bargain.isPending}
              className="pill pill-accent w-full sm:w-auto whitespace-nowrap"
            >
              {bargain.isPending ? '...' : i18n.bargainBtn}
            </button>
          </div>
          {bargainRes && bargainRes.items.length > 0 && (
            <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--bg-deep)' }}>
              <div className="flex justify-between text-sm font-medium mb-2">
                <span>最优组合</span>
                <span className="mono" style={{ color: 'var(--accent)' }}>合计 ¥{bargainRes.total.toFixed(2)}</span>
              </div>
              <div className="space-y-1 mb-3 text-sm" style={{ color: 'var(--fg-soft)' }}>
                {bargainRes.items.map((item) => (
                  <div key={item.dishId} className="flex justify-between">
                    <span>{item.name}</span>
                    <span className="mono">¥{item.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <button onClick={addBargainToCart} className="pill pill-accent w-full !h-11">一键加入购物车</button>
            </div>
          )}
          {bargainRes && bargainRes.items.length === 0 && (
            <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>预算不足，点不起任何菜</p>
          )}
        </div>
      </section>

      {isLoggedIn && availableCoupons.length > 0 && (
        <section className="px-4 md:px-8 pb-6">
          <div className="xcard p-6 max-w-2xl mx-auto">
            <h2 className="font-semibold mb-3">🎟️ 领券中心</h2>
            <div className="space-y-2">
              {availableCoupons.map((c) => {
                const claimed = claimedIds.includes(c.id);
                return (
                  <div key={c.id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--bg-deep)' }}>
                    <div>
                      <div className="font-medium text-sm">{c.title}</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        满 ¥{Number(c.threshold).toFixed(2)} 减 ¥{Number(c.amount).toFixed(2)}
                      </div>
                    </div>
                    <button
                      onClick={() => claimCoupon(c.id)}
                      disabled={claimed}
                      className={`pill !h-9 !px-5 !text-[13px] ${claimed ? 'pill-soft opacity-60' : 'pill-accent'}`}
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

      <section className="px-4 md:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-5">
            <h2 className="cjk-display text-xl md:text-2xl font-semibold">{i18n.menu}</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{i18n.menuSub}</p>
          </div>

          <div className="flex overflow-x-auto gap-2 mb-6 pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'thin' }}>
            <button
              onClick={() => setActiveCategory('all')}
              className={`pill !h-9 !px-5 !text-[13px] flex-shrink-0 whitespace-nowrap ${activeCategory === 'all' ? 'pill-accent' : 'pill-soft'}`}
            >全部</button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`pill !h-9 !px-5 !text-[13px] flex-shrink-0 whitespace-nowrap ${activeCategory === c.id ? 'pill-accent' : 'pill-soft'}`}
              >{c.name}</button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16" style={{ color: 'var(--muted)' }}>{i18n.empty}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((dish, idx) => (
                <DishCard
                  key={dish.id}
                  dish={dish}
                  index={idx}
                  onClick={openDish}
                  onAdd={addToCart}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedDish && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDish(null)}
        >
          <div className="xcard max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              {selectedDish.image ? <img src={selectedDish.image} alt={selectedDish.name} className="w-16 h-16 rounded-lg object-cover" /> : <span className="text-5xl">🍽️</span>}
              <button onClick={() => setSelectedDish(null)} className="text-lg" style={{ color: 'var(--muted)' }}>✕</button>
            </div>
            <h3 className="serif text-2xl font-semibold mb-2">{selectedDish.name}</h3>
            <p className="mb-4" style={{ color: 'var(--muted)' }}>{selectedDish.description || '暂无描述'}</p>
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
                <div className="text-sm mb-2" style={{ color: 'var(--muted)' }}>📈 近 90 天价格走势</div>
                <PriceChart data={priceHistory} />
              </div>
            )}

            {/* 评价区 */}
            <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-medium mb-2">
                💬 用户评价
                <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                  {reviewsQuery.data?.length ? `${reviewsQuery.data.length} 条` : ''}
                </span>
              </div>
              {reviewsQuery.isLoading ? (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>加载中...</p>
              ) : reviewsQuery.data?.length ? (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {reviewsQuery.data.map((r) => (
                    <div key={r.id} className="rounded-lg p-2" style={{ background: 'var(--bg-soft)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: 'var(--warn)' }}>{'⭐'.repeat(Math.max(1, Math.min(5, r.rating)))}</span>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>{r.isAnonymous ? '匿名' : (r.userName || '用户')}</span>
                      </div>
                      {r.content ? <p className="text-xs mt-1">{r.content}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>暂无评价</p>
              )}

              {/* 提交评价 */}
              <div className="mt-3">
                <div className="flex gap-0.5 mb-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setReviewRating(n)}
                      className={`text-lg ${n <= reviewRating ? '' : 'opacity-30'}`}
                      style={{ color: 'var(--warn)' }}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewContent}
                  onChange={(e) => setReviewContent(e.target.value)}
                  placeholder="说两句吧(选填)"
                  rows={2}
                  className="w-full rounded-lg p-2 text-xs mb-2"
                  style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)' }}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                    <input type="checkbox" checked={reviewAnonymous} onChange={(e) => setReviewAnonymous(e.target.checked)} />
                    匿名
                  </label>
                  <button
                    onClick={() => submitReview.mutate()}
                    disabled={submitReview.isPending}
                    className="pill pill-accent !h-8 !px-4 !text-xs"
                  >
                    {submitReview.isPending ? '提交中...' : '提交评价'}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <Link href="/assistant" className="pill pill-accent w-full">让 AI 帮我下单</Link>
            </div>
          </div>
        </div>
      )}

      <footer className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
        星选 AI 购物管家 · 真实数据驱动的电商 Agent 演示项目
      </footer>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-20 right-4 z-50 w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          ↑
        </button>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-14 border-t" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <Link href="/" className="flex flex-col items-center justify-center text-xs" style={{ color: 'var(--accent)' }}>
          <span className="text-lg">🏠</span><span>首页</span>
        </Link>
        <Link href="/assistant" className="flex flex-col items-center justify-center text-xs" style={{ color: 'var(--muted)' }}>
          <span className="text-lg">🤖</span><span>AI</span>
        </Link>
        <Link href="/cart" className="flex flex-col items-center justify-center text-xs" style={{ color: 'var(--muted)' }}>
          <span className="text-lg">🛒</span><span>购物车{cartCount > 0 && `(${cartCount})`}</span>
        </Link>
        <Link href={isLoggedIn ? '/account' : '/account/login'} className="flex flex-col items-center justify-center text-xs" style={{ color: 'var(--muted)' }}>
          <span className="text-lg">👤</span><span>{isLoggedIn ? '我的' : '登录'}</span>
        </Link>
      </nav>

      {toast.message && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-3 rounded-full text-sm shadow-lg z-50 text-white" style={{ background: 'var(--fg)' }}>
          {toast.message}
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
        <span>最新 ¥{last.price.toFixed(2)} · 最低 ¥{min.toFixed(2)}</span>
        <span>{new Date(last.timestamp * 1000).toLocaleDateString('zh-CN')}</span>
      </div>
    </div>
  );
}