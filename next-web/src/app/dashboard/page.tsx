'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { dashboardAPI } from '@/lib/api';

interface DashboardStats {
  totalOrders: number;
  totalDishes: number;
  totalUsers: number;
  todayRevenue: number;
  trend?: { date: string; count: number }[];
  topDishes?: { name: string; sales: number }[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    totalDishes: 0,
    totalUsers: 0,
    todayRevenue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res: any = await dashboardAPI.getStats();
      setStats(res);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div style={{ padding: '8px 0 18px' }}>
          <h1 className="atitle">数据统计仪表盘</h1>
          <div className="eyebrow">Overview · 实时数据</div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-500">加载中...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              <StatCard title="总订单数" value={stats.totalOrders} icon="📦" />
              <StatCard title="菜品总数" value={stats.totalDishes} icon="🍽️" />
              <StatCard title="用户总数" value={stats.totalUsers} icon="👥" />
              <StatCard title="今日营收" value={`¥${stats.todayRevenue}`} icon="💰" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="apanel">
                <h3 className="apanel-title mb-4">近 7 天订单趋势</h3>
                <TrendChart data={stats.trend || []} />
              </div>
              <div className="apanel">
                <h3 className="apanel-title mb-4">菜品销量排行</h3>
                {(stats.topDishes || []).length === 0 ? (
                  <p className="text-gray-400 text-sm">暂无销量数据</p>
                ) : (
                  <div className="space-y-2">
                    {(stats.topDishes || []).map((d, i) => (
                      <div key={d.name} className="flex items-center gap-3 text-sm">
                        <span className="text-gray-400 w-5">{i + 1}</span>
                        <span className="flex-1">{d.name}</span>
                        <span className="text-orange-600 font-medium">{d.sales} 份</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="apanel">
                <h3 className="apanel-title mb-4">快速操作</h3>
                <div className="space-y-3">
                  <QuickAction href="/orders" label="订单管理" icon="📋" />
                  <QuickAction href="/dishes" label="菜品管理" icon="🍳" />
                </div>
              </div>

              <div className="apanel">
                <h3 className="apanel-title mb-4">系统状态</h3>
                <div className="space-y-3">
                  <StatusItem label="API 服务" status="running" />
                  <StatusItem label="数据库" status="running" />
                  <StatusItem label="缓存服务" status="running" />
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="flex items-end gap-2 h-32">
        {data.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[11px] text-gray-400">{d.count}</span>
            <div
              className="w-full bg-orange-400 rounded-t"
              style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
            />
            <span className="text-[10px] text-gray-400">{d.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number | string; icon: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label mb-1">
        {icon} {title}
      </div>
      <div className="kpi-value" style={{ color: 'var(--gold-deep)' }}>
        {value}
      </div>
    </div>
  );
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-gray-700">{label}</span>
    </button>
  );
}

function StatusItem({ label, status }: { label: string; status: 'running' | 'stopped' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`px-2 py-1 text-xs rounded ${status === 'running' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {status === 'running' ? '运行中' : '已停止'}
      </span>
    </div>
  );
}
