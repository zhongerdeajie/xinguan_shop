'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import { useEmployeesQuery, useEmployeeMutations } from '@/lib/queries';
import { useAdminGuard } from '@/lib/guards';
import { useToast } from '@/lib/use-toast';
import type { Employee } from '@/types';

interface EmployeeForm {
  name: string;
  username: string;
  password: string;
  phone: string;
  sex: string;
  status: number;
}

const empty: EmployeeForm = { name: '', username: '', password: '', phone: '', sex: '', status: 1 };

export default function EmployeesPage() {
  useAdminGuard();
  const { data: list = [], isLoading: loading } = useEmployeesQuery();
  const { create, update, remove } = useEmployeeMutations();
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(empty);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setShowModal(true);
  }
  function openEdit(e: Employee) {
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
  }
  async function save() {
    try {
      if (editing) {
        const body: Record<string, unknown> = { name: form.name, phone: form.phone, sex: form.sex, status: form.status };
        if (form.password) body.password = form.password;
        await update.mutateAsync({ id: editing.id, body });
      } else {
        const body: Record<string, unknown> = { ...form };
        await create.mutateAsync(body);
      }
      setShowModal(false);
      setEditing(null);
      toast.show('已保存');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || '保存失败，用户名可能已存在');
    }
  }
  async function onRemove(id: number) {
    if (!confirm('确定删除这个员工吗？')) return;
    try {
      await remove.mutateAsync(id);
      toast.show('已删除');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || '删除失败');
    }
  }
  async function onToggle(e: Employee) {
    try {
      await update.mutateAsync({ id: e.id, body: { status: e.status === 1 ? 0 : 1 } });
    } catch (err: any) {
      toast.show(err?.response?.data?.message || '更新失败');
    }
  }

  return (
    <div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="atitle">员工管理</h1>
          <button onClick={openCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">+ 新增员工</button>
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
                      onClick={() => onToggle(e)}
                      disabled={update.isPending}
                      className={`px-2 py-1 rounded-full text-xs ${
                        e.status === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {e.status === 1 ? '启用' : '停用'}
                    </button>
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    <button onClick={() => openEdit(e)} className="text-primary-600 hover:underline">编辑</button>
                    <button onClick={() => onRemove(e.id)} disabled={remove.isPending} className="text-red-500 hover:underline">删除</button>
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
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-500">取消</button>
              <button onClick={save} disabled={create.isPending || update.isPending} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}