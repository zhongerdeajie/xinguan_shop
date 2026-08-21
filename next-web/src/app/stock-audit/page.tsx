'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Header from '@/components/Header';
import { useAdminGuard } from '@/lib/guards';
import { stockAuditAPI } from '@/lib/api';
import type { StockAudit } from '@/types';

/** 库存校准审计页: 查看 stock-sync 自动校准的漂移记录 */
export default function StockAuditPage() {
  useAdminGuard();
  const [dishId, setDishId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['stock-audit', dishId],
    queryFn: async () => {
      const res: any = await stockAuditAPI.list({
        dishId: dishId ? Number(dishId) : undefined,
        page: 1,
        pageSize: 50,
      });
      return (res?.data || []) as StockAudit[];
    },
  });

  const audits = data || [];

  return (
    <div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div style={{ padding: '8px 0 18px' }}>
          <h1 className="atitle">库存校准审计</h1>
          <div className="eyebrow">Inventory Audit · stock-sync 自动校准记录</div>
        </div>

        {/* 筛选 */}
        <div className="apanel mb-6 p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm" style={{ color: 'var(--muted)' }}>按菜品筛选：</span>
          <input
            type="number"
            value={dishId}
            onChange={(e) => setDishId(e.target.value)}
            placeholder="菜品 ID"
            className="w-32 rounded-lg px-3 py-1.5 text-sm"
            style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)' }}
          />
          <button
            onClick={() => setDishId('')}
            className="pill pill-ghost !h-9 !px-4 !text-xs"
          >
            清空
          </button>
          <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>
            共 {audits.length} 条记录
          </span>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : audits.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--muted)' }}>暂无库存校准记录</div>
        ) : (
          <div className="apanel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  <th className="py-3 px-3">ID</th>
                  <th className="py-3 px-3">菜品</th>
                  <th className="py-3 px-3">MySQL 库存</th>
                  <th className="py-3 px-3">Redis 库存</th>
                  <th className="py-3 px-3">漂移</th>
                  <th className="py-3 px-3">动作</th>
                  <th className="py-3 px-3">时间</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-2.5 px-3 text-gray-500">{a.id}</td>
                    <td className="py-2.5 px-3 font-medium">#{a.dishId}</td>
                    <td className="py-2.5 px-3">{a.mysqlStock}</td>
                    <td className="py-2.5 px-3">{a.redisStock}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className="font-mono font-semibold"
                        style={{ color: a.drift === 0 ? 'var(--muted)' : a.drift > 0 ? 'var(--warn)' : 'var(--danger)' }}
                      >
                        {a.drift > 0 ? '+' : ''}{a.drift}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-soft)', color: 'var(--muted)' }}>
                        {a.action || 'auto_scan'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">
                      {new Date(a.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
