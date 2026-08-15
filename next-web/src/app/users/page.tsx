'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

interface User {
  id: number;
  name?: string;
  phone?: string;
  openid?: string;
  createTime?: string;
}

export default function UsersPage() {
  const router = useRouter();
  const [list, setList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  async function load() {
    try {
      const res = await fetch('/api/users?page=1&limit=100', { headers: authHeaders() });
      const data = await res.json();
      setList(data.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    load();
  }, []);

  async function remove(id: number) {
    if (!confirm('确定删除这个用户吗？会同时影响其订单数据')) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) load();
  }

  return (
    <div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <h1 className="atitle mb-6">用户管理</h1>
        <div className="apanel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">姓名</th>
                <th className="px-4 py-3 text-left">手机号</th>
                <th className="px-4 py-3 text-left">微信 openid</th>
                <th className="px-4 py-3 text-left">注册时间</th>
                <th className="px-4 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">{u.id}</td>
                  <td className="px-4 py-3 font-medium">{u.name || '-'}</td>
                  <td className="px-4 py-3">{u.phone || '-'}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate">{u.openid || '-'}</td>
                  <td className="px-4 py-3">
                    {u.createTime ? new Date(u.createTime).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(u.id)} className="text-red-500 hover:underline">
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && list.length === 0 && (
            <div className="text-center py-10 text-gray-400">暂无用户（顾客注册功能尚未开放）</div>
          )}
        </div>
      </main>
    </div>
  );
}
