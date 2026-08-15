'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

interface Employee {
  id: number;
  name: string;
  username: string;
  phone?: string;
  sex?: string;
  status: number;
  createTime?: string;
}

export default function EmployeesPage() {
  const router = useRouter();
  const [list, setList] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    phone: '',
    sex: '',
    status: 1,
  });

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  async function load() {
    try {
      const res = await fetch('/api/employees?page=1&limit=100', { headers: authHeaders() });
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

  async function save() {
    const headers = { ...authHeaders(), 'Content-Type': 'application/json' };
    let res;
    if (editing) {
      const body: any = { name: form.name, phone: form.phone, sex: form.sex, status: form.status };
      if (form.password) body.password = form.password;
      res = await fetch(`/api/employees/${editing.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
    } else {
      res = await fetch('/api/employees', {
        method: 'POST',
        headers,
        body: JSON.stringify(form),
      });
    }
    if (res.ok) {
      setShowModal(false);
      setEditing(null);
      setForm({ name: '', username: '', password: '', phone: '', sex: '', status: 1 });
      load();
    } else {
      alert('保存失败，用户名可能已存在');
    }
  }

  async function remove(id: number) {
    if (!confirm('确定删除这个员工吗？')) return;
    const res = await fetch(`/api/employees/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) load();
  }

  async function toggleStatus(e: Employee) {
    const res = await fetch(`/api/employees/${e.id}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: e.status === 1 ? 0 : 1 }),
    });
    if (res.ok) load();
  }

  return (
    <div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="atitle">员工管理</h1>
          <button
            onClick={() => {
              setEditing(null);
              setForm({ name: '', username: '', password: '', phone: '', sex: '', status: 1 });
              setShowModal(true);
            }}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            + 新增员工
          </button>
        </div>
        <div className="apanel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">姓名</th>
                <th className="px-4 py-3 text-left">用户名</th>
                <th className="px-4 py-3 text-left">手机号</th>
                <th className="px-4 py-3 text-left">性别</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">{e.id}</td>
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3">{e.username}</td>
                  <td className="px-4 py-3">{e.phone || '-'}</td>
                  <td className="px-4 py-3">{e.sex || '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleStatus(e)}
                      className={`px-2 py-1 rounded-full text-xs ${
                        e.status === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {e.status === 1 ? '启用' : '停用'}
                    </button>
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    <button
                      onClick={() => {
                        setEditing(e);
                        setForm({
                          name: e.name,
                          username: e.username,
                          password: '',
                          phone: e.phone || '',
                          sex: e.sex || '',
                          status: e.status,
                        });
                        setShowModal(true);
                      }}
                      className="text-primary-600 hover:underline"
                    >
                      编辑
                    </button>
                    <button onClick={() => remove(e.id)} className="text-red-500 hover:underline">
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && list.length === 0 && (
            <div className="text-center py-10 text-gray-400">暂无员工</div>
          )}
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">{editing ? '编辑员工' : '新增员工'}</h2>
            <div className="space-y-3">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="姓名"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="用户名"
                disabled={!!editing}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
              />
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? '留空则不修改密码' : '密码'}
                type="password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="手机号"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <select
                value={form.sex}
                onChange={(e) => setForm({ ...form, sex: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">未设置</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-500">
                取消
              </button>
              <button
                onClick={save}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
