'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import { useDishesQuery, useCategoriesQuery } from '@/lib/queries';
import { useAdminGuard } from '@/lib/guards';
import { dishesAPI } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queries';
import { useToast } from '@/lib/use-toast';
import type { Dish } from '@/types';

interface DishForm {
  name: string;
  categoryId: string;
  price: string;
  description: string;
  status: number;
}

const emptyForm: DishForm = { name: '', categoryId: '', price: '', description: '', status: 1 };

export default function DishesPage() {
  useAdminGuard();
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Dish | null>(null);
  const [form, setForm] = useState<DishForm>(emptyForm);

  const { data, isLoading: loading } = useDishesQuery(page, categoryFilter);
  const { data: catData } = useCategoriesQuery();
  const categories = Array.isArray(catData) ? catData : catData?.data || [];
  const dishes = data?.data || [];
  const totalPages = data?.meta?.totalPages || 1;

  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (payload: { id?: number; body: Record<string, unknown> }) =>
      payload.id ? dishesAPI.update(payload.id, payload.body) : dishesAPI.create(payload.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dishes'] });
      setShowModal(false);
      setEditing(null);
      setForm(emptyForm);
      toast.show('已保存');
    },
    onError: (e: any) => toast.show(e?.response?.data?.message || '保存失败'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => dishesAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dishes'] });
      toast.show('已删除');
    },
    onError: () => toast.show('删除失败'),
  });
  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: number; status: number }) => dishesAPI.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dishes'] }),
  });

  function openEdit(dish: Dish) {
    setEditing(dish);
    setForm({
      name: dish.name,
      categoryId: String(dish.categoryId),
      price: String(dish.price),
      description: dish.description || '',
      status: dish.status,
    });
    setShowModal(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate({
      id: editing?.id,
      body: {
        name: form.name,
        categoryId: Number(form.categoryId),
        price: Number(form.price),
        description: form.description,
        status: form.status,
      },
    });
  }

  function onDelete(id: number) {
    if (!confirm('确定要删除这个菜品吗？')) return;
    remove.mutate(id);
  }

  return (
    <div className="min-h-screen md:pl-60" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <h1 className="atitle mb-6">菜品管理</h1>
          <div className="flex items-center gap-3">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value ? Number(e.target.value) : '')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">全部分类</option>
              {categories.map((cat: any) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <button
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
                setShowModal(true);
              }}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              + 新增菜品
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-500">加载中...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {dishes.map((dish) => (
                <div key={dish.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="h-40 bg-gradient-to-br from-orange-100 to-yellow-50 flex items-center justify-center">
                    {dish.image ? (
                      <img src={dish.image} alt={dish.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-5xl">🍽️</span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">{dish.name}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${dish.status === 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {dish.status === 1 ? '在售' : '停售'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{dish.description || '暂无描述'}</p>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xl font-bold text-primary-600">¥{dish.price}</span>
                      <span className="text-xs text-gray-400">{dish.categoryName}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(dish)}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => toggle.mutate({ id: dish.id, status: dish.status === 1 ? 0 : 1 })}
                        disabled={toggle.isPending}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        {dish.status === 1 ? '停售' : '启售'}
                      </button>
                      <button
                        onClick={() => onDelete(dish.id)}
                        disabled={remove.isPending}
                        className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-8">
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

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                {editing ? '编辑菜品' : '新增菜品'}
              </h2>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">菜品名称</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  >
                    <option value="">请选择分类</option>
                    {categories.map((cat: any) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">价格</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    rows={3}
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={save.isPending}
                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {save.isPending ? '保存中…' : editing ? '保存' : '创建'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// 确保 queryKeys 引用进来
void queryKeys;