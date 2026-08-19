import HomeClient from '@/components/HomeClient';
import type { Category, Dish } from '@/types';

// 服务端组件:数据在服务器取好,直接塞进首屏 HTML
// - SEO 友好:爬虫拿到 HTML 就能看到菜品
// - 首屏快:不用等浏览器 JS 再发请求
// 后端 API 通过环境变量配置,默认走 Docker 内部 DNS(http://nestjs-api:3000)
const API_BASE = process.env.API_BASE_URL || 'http://nestjs-api:3000';

// NestJS 启用了 URI 版本控制,业务接口在 /v1 下
// 数据结构与浏览器版一致:返回 { data: [...] } 或直接数组
async function fetchDishes(): Promise<Dish[]> {
  try {
    const res = await fetch(`${API_BASE}/v1/dishes?limit=100`, {
      // 服务端组件推荐:开启缓存,让相同请求复用结果
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json = await res.json();
    // 兼容两种返回结构:{data: [...]} 或 直接数组
    const list = Array.isArray(json) ? json : (json?.data || []);
    return list as Dish[];
  } catch (e) {
    console.error('[SSR] 加载菜品失败:', e);
    return [];
  }
}

async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE}/v1/categories`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json = await res.json();
    const list = Array.isArray(json) ? json : (json?.data || []);
    return list as Category[];
  } catch (e) {
    console.error('[SSR] 加载分类失败:', e);
    return [];
  }
}

// 服务端组件:无 'use client',async 函数体在 Node 服务器执行
export default async function HomePage() {
  // 并发取数,缩短服务端等待时间
  const [initialDishes, initialCategories] = await Promise.all([
    fetchDishes(),
    fetchCategories(),
  ]);

  // 把服务端取好的数据作为 props 传给客户端子组件
  // - 首屏 HTML 里直接就有菜品列表(SEO 友好)
  // - 交互逻辑(购物车/凑单/领券/弹窗)仍在浏览器跑
  return (
    <HomeClient
      initialDishes={initialDishes}
      initialCategories={initialCategories}
    />
  );
}
