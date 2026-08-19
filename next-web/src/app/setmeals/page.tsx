'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import { useSetmealsQuery, useSetmealMutations, useCategoriesAdminQuery } from '@/lib/queries';
import { useAdminGuard } from '@/lib/guards';
import { useToast } from '@/lib/use-toast';
import type { Setmeal } from '@/types';

interface SetmealForm {
  name: string;
  categoryId: string;
  price: string;
  description: string;
  status: number;
}

const empty: SetmealForm = { name: '', categoryId: '', price: '', description: '', status: 1 };

export default function SetmealsPage() {
  useAdminGuard();
  const { data: list = [], isLoading: loading } = useSetmealsQuery();
  const { data: categories = [] } = useCategoriesAdminQuery();
  const { create, update, remove } = useSetmealMutations();
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Setmeal | null>(null);
  const [form, setForm] = useState<SetmealForm>(empty);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setShowModal(true);
  }
  function openEdit(s: Setmeal) {
    setEditing(s);
    setForm({
      name: s.name,
      categoryId: String(s.categoryId),
      price: String(s.price),
      description: s.description || '',
      status: s.status,
    });
    setShowModal(true);
  }
  async function save() {
    const body = {
      name: form.name,
      categoryId: Number(form.categoryId),
      price: Number(form.price),
      description: form.description,
      status: form.status,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body });
      else await create.mutateAsync(body);
      setShowModal(false);
      setEditing(null);
      toast.show('已保存');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || '保存失败');
    }
  }
  async function onRemove(id: number) {
    if (!confirm('确定删除这个套餐吗？')) return;
    try {
      await remove.mutateAsync(id);
      toast.show('已删除');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || '删除失败');
    }
  }
  async function onToggle(s: Setmeal) {
    try {
      await update.mutateAsync({ id: s.id, body: { status: s.status === 1 ? 0 : 1 } });
    } catch (e: any) {
      toast.show(e?.response?.data?.message || '更新失败');
    }
  }

  return (
    <div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="atitle">套餐管理</h1>
          <button onClick={openCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">+ 新增套餐</button>
        </div>
        <div className="apanel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">名称</th>
                <th className="px-4 py-3 text-left">分类</th>
                <th className="px-4 py-3 text-left">价格</th>
                <th className="px-4 py-3 text-left">描述</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">{s.id}</td>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">{s.category?.name || '-'}</td>
                  <td className="px-4 py-3">¥{Number(s.price).toFixed(2)}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate">{s.description || '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggle(s)}
                      disabled={update.isPending}
                      className={`px-2 py-1 rounded-full text-xs ${
                        s.status === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {s.status === 1 ? '启用' : '停用'}
                    </button>
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    <button onClick={() => openEdit(s)} className="text-primary-600 hover:underline">编辑</button>
                    <button onClick={() => onRemove(s.id)} disabled={remove.isPending} className="text-red-500 hover:underline">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && list.length === 0 && (
            <div className="text-center py-10 text-gray-400">暂无套餐</div>
          )}
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">{editing ? '编辑套餐' : '新增套餐'}</h2>
            <div className="space-y-3">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="套餐名称"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">选择分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="价格"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="描述"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
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