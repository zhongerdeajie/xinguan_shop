'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import { useAdminOrdersWS } from '@/lib/useAdminOrdersWS';
import { useOrdersQuery, useUpdateOrderStatusMutation } from '@/lib/queries';
import { useAdminGuard } from '@/lib/guards';
import type { Order } from '@/types';

const statusMap: Record<number, { label: string; color: string }> = {
  1: { label: '待付款', color: 'bg-yellow-100 text-yellow-800' },
  2: { label: '待接单', color: 'bg-blue-100 text-blue-800' },
  3: { label: '已接单', color: 'bg-green-100 text-green-800' },
  4: { label: '派送中', color: 'bg-purple-100 text-purple-800' },
  5: { label: '已完成', color: 'bg-gray-100 text-gray-800' },
  6: { label: '已取消', color: 'bg-red-100 text-red-800' },
};

export default function OrdersPage() {
  useAdminGuard();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<number | ''>('');
  const { data, isLoading: loading, refetch } = useOrdersQuery(page, statusFilter);
  const updateStatus = useUpdateOrderStatusMutation();

  const orders = (data?.data || []) as Order[];
  const totalPages = data?.meta?.totalPages || 1;

  const handleNewOrder = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        }
      } catch {
        /* 静默失败 */
      }
    }
    setPage(1);
    refetch();
  }, [refetch]);
  useAdminOrdersWS({ onNewOrder: handleNewOrder });

  return (
    <div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <h1 className="atitle mb-6">订单管理</h1>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value ? Number(e.target.value) : '')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">全部状态</option>
              <option value="1">待付款</option>
              <option value="2">待接单</option>
              <option value="3">已接单</option>
              <option value="4">派送中</option>
              <option value="5">已完成</option>
              <option value="6">已取消</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-500">加载中...</p>
          </div>
        ) : (
          <>
            <div className="apanel overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">订单号</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">顾客</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">联系电话</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金额</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">下单时间</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {order.number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.consignee || order.userName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.phone}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                        ¥{order.amount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(order.orderTime).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${statusMap[order.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                          {statusMap[order.status]?.label || '未知'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {order.status === 2 && (
                          <button
                            onClick={() => updateStatus.mutate({ id: order.id, status: 3 })}
                            disabled={updateStatus.isPending}
                            className="text-primary-600 hover:text-primary-800 font-medium"
                          >
                            接单
                          </button>
                        )}
                        {order.status === 3 && (
                          <button
                            onClick={() => updateStatus.mutate({ id: order.id, status: 4 })}
                            disabled={updateStatus.isPending}
                            className="text-primary-600 hover:text-primary-800 font-medium"
                          >
                            派送
                          </button>
                        )}
                        {order.status === 4 && (
                          <button
                            onClick={() => updateStatus.mutate({ id: order.id, status: 5 })}
                            disabled={updateStatus.isPending}
                            className="text-primary-600 hover:text-primary-800 font-medium"
                          >
                            完成
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-gray-500">
                共 {totalPages} 页，当前第 {page} 页
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}