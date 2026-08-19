'use client';

// 轻量 toast 工具:
// - Toast 组件:在根 layout 挂一次,任何页面触发都能显示
// - useToast hook:在任意客户端组件调 toast.show('消息')
// - 为什么不用 react-hot-toast / sonner?为了零依赖,且本项目只需要 1 种样式
//
// 用法:
//   1) app/layout.tsx 里加 <ToastHost />
//   2) 任何组件里 const toast = useToast(); toast.show('加入购物车');

import { useEffect, useState } from 'react';

type ToastFn = (message: string, durationMs?: number) => void;

// 模块级单例:同一个浏览器 tab 里所有组件共享一个 toast
let _setMsg: ToastFn | null = null;

export function showToast(message: string, durationMs = 2000) {
  _setMsg?.(message, durationMs);
}

export function useToast() {
  return { show: showToast };
}

export function ToastHost() {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    _setMsg = (text: string, durationMs = 2000) => {
      setMsg(text);
      setVisible(true);
      // 每次调用前清掉上一个定时器,避免被覆盖
      const id = (window as any).__toastTimer;
      if (id) clearTimeout(id);
      (window as any).__toastTimer = setTimeout(() => setVisible(false), durationMs);
    };
    return () => {
      _setMsg = null;
    };
  }, []);

  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 px-5 py-3 rounded-full text-sm shadow-lg z-50 text-white"
      style={{ background: 'var(--fg)' }}
    >
      {msg}
    </div>
  );
}