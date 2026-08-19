'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 极简 toast hook:替换散在各页面的 setToast('xxx'); setTimeout(()=>setToast(''), 2000)
 */
export function useToast(defaultMs = 2200) {
  const [message, setMessage] = useState('');
  const show = useCallback((msg: string, ms = defaultMs) => {
    setMessage(msg);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setMessage(''), ms);
    }
  }, [defaultMs]);
  useEffect(() => () => setMessage(''), []);
  return { message, show, clear: () => setMessage('') };
}