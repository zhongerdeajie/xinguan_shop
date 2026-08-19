// 顾客未登录时,商品暂存在浏览器 localStorage
// 登录成功后由 login 页调 mergeLocalCartToServer 合并到 Go service
//
// 为什么不直接 localStorage.setItem(JSON.stringify(...))?
// - 同一菜品重复加购物车,要累加 number 而不是新建条目
// - 提供清晰的 API,各调用点不直接读 localStorage 字符串
// - 兼容老数据(损坏/旧字段,getter 返回空数组)

const KEY = 'guestCart';

export interface GuestCartItem {
  dishId: number;
  number: number;
  name: string;
  price: number;
  image?: string;
}

export function getLocalCart(): GuestCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.dishId === 'number') : [];
  } catch {
    // 旧数据/损坏数据,直接丢弃,不让一个坏 JSON 把整个页面白屏
    return [];
  }
}

export function addToLocalCart(item: Omit<GuestCartItem, 'number'> & { number?: number }): GuestCartItem[] {
  const cart = getLocalCart();
  const idx = cart.findIndex((c) => c.dishId === item.dishId);
  if (idx >= 0) {
    cart[idx] = { ...cart[idx], number: cart[idx].number + (item.number ?? 1) };
  } else {
    cart.push({ ...item, number: item.number ?? 1 });
  }
  localStorage.setItem(KEY, JSON.stringify(cart));
  // 返回新数组,方便调用方 setState
  return cart;
}

export function removeFromLocalCart(dishId: number): GuestCartItem[] {
  const cart = getLocalCart().filter((c) => c.dishId !== dishId);
  localStorage.setItem(KEY, JSON.stringify(cart));
  return cart;
}

export function updateLocalCartQty(dishId: number, number: number): GuestCartItem[] {
  const cart = getLocalCart().map((c) => (c.dishId === dishId ? { ...c, number: Math.max(0, number) } : c))
    .filter((c) => c.number > 0);
  localStorage.setItem(KEY, JSON.stringify(cart));
  return cart;
}

export function clearLocalCart(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(KEY);
}

export function getLocalCartCount(): number {
  return getLocalCart().reduce((sum, c) => sum + c.number, 0);
}

/**
 * 登录成功后调:把 localStorage 里的暂存商品批量加到服务端购物车
 * - 用 Promise.all 并发请求,任一失败不阻塞其它
 * - 合并完成后无论成功失败都清空本地暂存(防重复加)
 * - 失败的项目用 onError 回调上报,不影响主流程
 */
export async function mergeLocalCartToServer(
  token: string,
  onError?: (item: GuestCartItem, err: Error) => void,
): Promise<{ merged: number; failed: number }> {
  const cart = getLocalCart();
  if (cart.length === 0) return { merged: 0, failed: 0 };

  let merged = 0;
  let failed = 0;
  // 顺序追加更稳,避免并发把同一菜品多次 +1 出现数量翻倍
  for (const item of cart) {
    try {
      const res = await fetch('/go/cart/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dishId: item.dishId, number: item.number }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `HTTP ${res.status}`);
      }
      merged++;
    } catch (e: any) {
      failed++;
      onError?.(item, e);
    }
  }
  clearLocalCart();
  return { merged, failed };
}