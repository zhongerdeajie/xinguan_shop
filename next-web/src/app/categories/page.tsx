'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import { useCategoriesAdminQuery, useCategoryMutations } from '@/lib/queries';
import { useAdminGuard } from '@/lib/guards';
import { useToast } from '@/lib/use-toast';
import type { Category } from '@/types';

interface CategoryForm {
  name: string;
  type: number;
  sort: number;
  status: number;
}

const empty: CategoryForm = { name: '', type: 1, sort: 0, status: 1 };

export default function CategoriesPage() {
  useAdminGuard();
  const { data: list = [], isLoading: loading } = useCategoriesAdminQuery();
  const { create, update, remove } = useCategoryMutations();
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(empty);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setShowModal(true);
  }
  function openEdit(c: Category) {
    setEditing(c);
    setForm({ name: c.name, type: c.type || 1, sort: c.sort, status: c.status });
    setShowModal(true);
  }
  async function save() {
    try {
      const body: Record<string, unknown> = { ...form };
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
    if (!confirm('确定删除这个分类吗？')) return;
    try {
      await remove.mutateAsync(id);
      toast.show('已删除');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || '删除失败');
    }
  }
  async function onToggle(c: Category) {
    try {
      await update.mutateAsync({ id: c.id, body: { status: c.status === 1 ? 0 : 1 } });
    } catch (e: any) {
      toast.show(e?.response?.data?.message || '更新失败');
    }
  }

  return (
    <div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="atitle">分类管理</h1>
          <button onClick={openCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            + 新增分类
          </button>
        </div>
        <div className="apanel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">名称</th>
                <th className="px-4 py-3 text-left">类型</th>
                <th className="px-4 py-3 text-left">排序</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">{c.id}</td>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">{c.type === 1 ? '菜品分类' : '套餐分类'}</td>
                  <td className="px-4 py-3">{c.sort}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggle(c)}
                      disabled={update.isPending}
                      className={`px-2 py-1 rounded-full text-xs ${
                        c.status === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {c.status === 1 ? '启用' : '停用'}
                    </button>
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    <button onClick={() => openEdit(c)} className="text-primary-600 hover:underline">编辑</button>
                    <button onClick={() => onRemove(c.id)} disabled={remove.isPending} className="text-red-500 hover:underline">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && list.length === 0 && (
            <div className="text-center py-10 text-gray-400">暂无分类</div>
          )}
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">{editing ? '编辑分类' : '新增分类'}</h2>
            <div className="space-y-3">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="分类名称"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value={1}>菜品分类</option>
                <option value={2}>套餐分类</option>
              </select>
              <input
                type="number"
                value={form.sort}
                onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })}
                placeholder="排序"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-500">取消</button>
              <button onClick={save} disabled={create.isPending || update.isPending} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}