'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { CustomerNav, NavBackLink } from '@/components/CustomerNav';
import { CompactDishRow } from '@/components/CompactDishRow';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
}

interface OrderSuggestion {
  items: { dishId: number; name: string; price: number; number: number }[];
  total: number;
}

const SUGGESTIONS = [
  '帮我推荐两个评分最高的菜',
  '预算 50 元，帮我凑一个两人套餐',
  '辣椒炒肉和米饭一共多少钱',
];

const T = {
  brand: '星选 AI 购物管家',
  back: '← 返回菜单',
  placeholder: '例如：我想点两个菜，预算 40 元',
  send: '发送',
  thinking: '正在思考中...',
  saved: '对话已自动保存到我的聊天记录 →',
  loginHint: '登录后聊天记录、浏览记录、订单会自动保存 →',
  confirm: '确认下单 ¥',
  ordering: '正在下单并支付...',
  ordered: '下单成功！去我的订单查看 →',
};

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '你好！我是星选 AI 点餐助手。你可以直接告诉我你想吃什么、预算多少，我会帮你推荐、凑单和比价。试试下面的问题？',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [orderSuggestion, setOrderSuggestion] = useState<OrderSuggestion | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [orderMsg, setOrderMsg] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 加载本地缓存的未登录聊天记录
    const cached = localStorage.getItem('guestChatHistory');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 1) {
          setMessages(parsed);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const t = T;

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setInput('');
    setOrderMsg('');
    setOrderSuggestion(null);
    setMessages((prev) => [...prev, { role: 'user', content }]);
    setLoading(true);

    try {
      const customerToken = localStorage.getItem('customerToken');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (customerToken) headers.Authorization = `Bearer ${customerToken}`;
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: content, sessionId: 'web-customer' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const assistantMsg = {
        role: 'assistant' as const,
        content: data.response || '（AI 没有返回内容，请重试）',
        intent: data.agent || data.intent,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      // 未登录时将聊天记录缓存到 localStorage
      if (!customerToken) {
        setMessages((prev) => {
          const guestMessages = [...prev, assistantMsg];
          localStorage.setItem('guestChatHistory', JSON.stringify(guestMessages));
          return prev;
        });
      } else {
        // 已登录，检查是否有本地缓存的聊天记录需要同步
        const cached = localStorage.getItem('guestChatHistory');
        if (cached) {
          localStorage.removeItem('guestChatHistory');
        }
      }
      if (data.order_suggestion?.items?.length) {
        setOrderSuggestion(data.order_suggestion);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'AI 服务暂时不可用，请稍后重试。' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmOrder() {
    if (!orderSuggestion || ordering) return;
    const token = localStorage.getItem('customerToken');
    if (!token) {
      window.location.href = '/account/login';
      return;
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    setOrdering(true);
    try {
      const addrRes = await fetch('/go/addresses', { headers });
      const addrData = await addrRes.json();
      const address = (addrData.data || [])[0];
      if (!address) throw new Error('没有收货地址');

      for (const item of orderSuggestion.items) {
        const addRes = await fetch('/go/cart/add', {
          method: 'POST',
          headers,
          body: JSON.stringify({ dishId: item.dishId, number: item.number }),
        });
        if (!addRes.ok) throw new Error('加入购物车失败');
      }
      const orderRes = await fetch('/go/orders/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify({ addressBookId: address.id, remark: 'AI 下单', payMethod: 1 }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || '下单失败');

      const payRes = await fetch('/go/payment/pay', {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderNumber: orderData.data.orderNumber, payMethod: 1 }),
      });
      if (!payRes.ok) throw new Error('支付失败');

      setOrderSuggestion(null);
      setOrderMsg(t.ordered);
    } catch (e: any) {
      setOrderMsg(e.message || '下单失败');
    } finally {
      setOrdering(false);
    }
  }

  function toggleMic() {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('当前浏览器不支持语音识别，请使用 Chrome 或 Edge');
      return;
    }
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput((prev) => (prev ? prev + transcript : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <CustomerNav rightSlot={<NavBackLink label={t.back} />} />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} rise`}>
            <div
              className="max-w-[78%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
              style={{
                borderRadius: 16,
                background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-deep)',
                color: m.role === 'user' ? 'var(--accent-ink)' : 'var(--fg)',
                borderTopLeftRadius: m.role === 'user' ? 16 : 6,
                borderTopRightRadius: m.role === 'user' ? 6 : 16,
              }}
            >
              {m.intent && m.role === 'assistant' && (
                <div className="text-[11px] mb-1" style={{ color: 'var(--muted)' }}>
                  由 {m.intent} Agent 回答
                </div>
              )}
              <MarkdownRenderer content={m.content} />
            </div>
          </div>
        ))}

        {orderSuggestion && (
          <div className="xcard p-5 rise" style={{ borderColor: 'var(--accent)' }}>
            <div className="text-sm font-semibold mb-3">🛒 AI 已为你搭配好，确认下单？</div>
            <div className="space-y-1 mb-3">
              {orderSuggestion.items.map((item) => (
                <CompactDishRow
                  key={item.dishId}
                  name={item.name}
                  number={item.number}
                  price={item.price}
                />
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="mono font-semibold" style={{ color: 'var(--accent)' }}>
                {t.confirm}
                {orderSuggestion.total.toFixed(2)}
              </span>
              <button onClick={confirmOrder} disabled={ordering} className="pill pill-accent">
                {ordering ? t.ordering : t.send}
              </button>
            </div>
            {orderMsg && (
              <div className="mt-3 text-sm">
                {orderMsg.includes('下单成功') ? (
                  <Link href="/account?tab=orders" style={{ color: 'var(--accent)' }} className="font-medium">
                    {orderMsg}
                  </Link>
                ) : (
                  <span style={{ color: 'var(--danger)' }}>{orderMsg}</span>
                )}
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex justify-start">
            <div
              className="px-4 py-3 text-sm"
              style={{ background: 'var(--bg-deep)', borderRadius: 16, borderTopLeftRadius: 6 }}
            >
              {t.thinking}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="sticky bottom-0 z-30" style={{ background: 'oklch(98% 0.008 85 / 0.9)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={loading}
                className="pill pill-soft !h-8 !px-4 !text-xs"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
            {typeof window !== 'undefined' && localStorage.getItem('customerToken') ? (
              <Link href="/account?tab=chat" style={{ color: 'var(--accent)' }}>
                {t.saved}
              </Link>
            ) : (
              <Link href="/account/login" style={{ color: 'var(--accent)' }}>
                {t.loginHint}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={t.placeholder}
              disabled={loading}
              className="flex-1 min-w-0 px-4 md:px-5 py-3 rounded-full border focus:outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            />
            <button
              onClick={toggleMic}
              disabled={loading}
              className="pill !px-3 md:!px-4 !h-12 !text-lg shrink-0"
              style={{
                background: listening ? 'var(--danger)' : 'var(--bg-deep)',
                color: listening ? '#fff' : 'var(--fg)',
              }}
              title="语音输入"
            >
              🎤
            </button>
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="pill pill-accent !h-12 !px-5 md:!px-6 shrink-0"
            >
              {t.send}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
