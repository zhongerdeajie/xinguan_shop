'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface AdminOrderEvent {
  id: number;
  number: string;
  userId: number;
  amount: number;
  status: number;
  createdAt: string;
}

/**
 * useAdminOrdersWS — 管理员订阅新订单 WebSocket
 *
 * 必须在管理员后台页面使用(已登录的管理员)
 * 自动重连(指数退避),断线时不会丢失连接
 *
 * 用法:
 *   const { connected, lastNewOrder } = useAdminOrdersWS({
 *     onNewOrder: (order) => toast(`新订单 #${order.number}`),
 *   });
 */
export function useAdminOrdersWS(opts: {
  onNewOrder?: (order: AdminOrderEvent) => void;
  enabled?: boolean;
} = {}) {
  const { onNewOrder, enabled = true } = opts;
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastNewOrder, setLastNewOrder] = useState<AdminOrderEvent | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // 直连 nestjs-api 的 3000 端口
    // 后端 namespace=/ws/admin-orders(URL 路径),socket.io 自动加 /socket.io
    const socket = io('http://localhost:3000/ws/admin-orders', {
      withCredentials: true, // 带 cookie
      transports: ['websocket'], // 跳过 polling,直接 WebSocket
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connected', () => {
      // 后端握手成功事件(可选)
    });

    socket.on('order:new', (order: AdminOrderEvent) => {
      setLastNewOrder(order);
      onNewOrder?.(order);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, onNewOrder]);

  return { connected, lastNewOrder };
}