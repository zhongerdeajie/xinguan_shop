'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { CustomerNav, NavBackLink } from '@/components/CustomerNav';
import { CompactDishRow } from '@/components/CompactDishRow';
import { useAuthStore, useCartStore } from '@/lib/stores';
import { useToast } from '@/lib/use-toast';
import api from '@/lib/api';

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
  const customerToken = useAuthStore((s) => s.customerToken);
  const addGuest = useCartStore((s) => s.add);
  const toast = useToast();
  void addGuest;

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
    const cached = localStorage.getItem('guestChatHistory');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 1) setMessages(parsed);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');
    setOrderMsg('');
    setOrderSuggestion(null);
    setMessages((prev) => [...prev, { role: 'user', content }]);
    setLoading(true);

    let intentLabel = '';
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (customerToken) headers.Authorization = `Bearer ${customerToken}`;
      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: content, sessionId: 'web-customer' }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      setMessages((prev) => [...prev, { role: 'assistant', content: '', intent: '' }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const evt of events) {
          const lines = evt.split('\n').filter((l) => l.startsWith('data:'));
          if (!lines.length) continue;
          const payload = lines.map((l) => l.slice(5).trim()).join('\n');
          if (!payload) continue;
          try {
            const data = JSON.parse(payload);
            if (data.type === 'meta') {
              intentLabel = data.agent || data.intent || '';
            } else if (data.type === 'chunk') {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + data.delta, intent: intentLabel || last.intent };
                }
                return next;
              });
            } else if (data.type === 'order_suggest') {
              setOrderSuggestion({ items: data.items, total: data.total });
            }
          } catch {
            /* ignore malformed */
          }
        }
      }

      if (!customerToken) {
        setMessages((prev) => {
          localStorage.setItem('guestChatHistory', JSON.stringify(prev));
          return prev;
        });
      } else {
        localStorage.removeItem('guestChatHistory');
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'AI 服务暂时不可用，请稍后重试。' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const confirmOrder = useMutation({
    mutationFn: async () => {
      if (!orderSuggestion) throw new Error('没有可下单的方案');
      const headers = { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' };
      const addrRes: any = await api.get('/go/addresses');
      const address = (addrRes.data?.data || [])[0];
      if (!address) throw new Error('没有收货地址');
      for (const item of orderSuggestion.items) {
        const r: any = await api.post('/go/cart/add', { dishId: item.dishId, number: item.number });
        if (!r.status.toString().startsWith('2')) throw new Error('加入购物车失败');
      }
      const orderRes: any = await api.post('/go/orders/submit', { addressBookId: address.id, remark: 'AI 下单', payMethod: 1 });
      if (!orderRes.status.toString().startsWith('2')) throw new Error(orderRes.data?.error || '下单失败');
      const orderNumber = orderRes.data?.data?.orderNumber || orderRes.data?.orderNumber;
      const payRes: any = await api.post('/go/payment/pay', { orderNumber, payMethod: 1 });
      if (!payRes.status.toString().startsWith('2')) throw new Error('支付失败');
    },
    onMutate: () => setOrdering(true),
    onSuccess: () => {
      setOrderSuggestion(null);
      setOrderMsg(T.ordered);
      setOrdering(false);
    },
    onError: (e: any) => {
      setOrderMsg(e?.message || '下单失败');
      setOrdering(false);
    },
  });

  function toggleMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.show('当前浏览器不支持语音识别，请使用 Chrome 或 Edge');
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
      <CustomerNav rightSlot={<NavBackLink label={T.back} />} />

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
                {T.confirm}
                {orderSuggestion.total.toFixed(2)}
              </span>
              <button
                onClick={() => confirmOrder.mutate()}
                disabled={ordering || !customerToken}
                className="pill pill-accent"
              >
                {ordering ? T.ordering : T.send}
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
              {T.thinking}
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
            {customerToken ? (
              <Link href="/account?tab=chat" style={{ color: 'var(--accent)' }}>
                {T.saved}
              </Link>
            ) : (
              <Link href="/account/login" style={{ color: 'var(--accent)' }}>
                {T.loginHint}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={T.placeholder}
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
              {T.send}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

// avoid unused-vars (addGuest is reserved for inline "加入购物车" button)