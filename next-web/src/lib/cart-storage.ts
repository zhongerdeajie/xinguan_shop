// 顾客未登录时,商品暂存在浏览器 localStorage
// 登录成功后由 login 页调 mergeLocalCartToServer 合并到 Go service

export interface GuestCartItem {
  dishId: number;
  number: number;
  name: string;
  price: number;
  image?: string;
}

const KEY = 'guestCart';

// ==================== Pure cart operations ====================
// 这些函数接收一个数组、返回一个新数组;不触碰 localStorage
// 这样 useCartStore.hydrate 可以传入初始值,逻辑可单测

export function readLocalCart(): GuestCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.dishId === 'number') : [];
  } catch {
    return [];
  }
}

export function writeLocalCart(items: GuestCartItem[]): void {
  if (typeof window === 'undefined') return;
  if (items.length === 0) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(items));
}

export function clearLocalCart(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}

/** 在当前购物车里追加一个菜品,同 dishId 累加 number */
export function addItem(cart: GuestCartItem[], item: Omit<GuestCartItem, 'number'> & { number?: number }): GuestCartItem[] {
  const idx = cart.findIndex((c) => c.dishId === item.dishId);
  if (idx >= 0) {
    const next = [...cart];
    next[idx] = { ...next[idx], number: next[idx].number + (item.number ?? 1) };
    return next;
  }
  return [...cart, { ...item, number: item.number ?? 1 }];
}

/** 按 dishId 删除 */
export function removeItem(cart: GuestCartItem[], dishId: number): GuestCartItem[] {
  return cart.filter((c) => c.dishId !== dishId);
}

/** 修改数量,小于等于 0 视同删除 */
export function updateQty(cart: GuestCartItem[], dishId: number, delta: number): GuestCartItem[] {
  const next = cart
    .map((c) => (c.dishId === dishId ? { ...c, number: c.number + delta } : c))
    .filter((c) => c.number > 0);
  return next;
}

/** 把 number 设为绝对值(不是 delta);小于等于 0 视同删除 */
export function setQty(cart: GuestCartItem[], dishId: number, absoluteNumber: number): GuestCartItem[] {
  if (absoluteNumber <= 0) return removeItem(cart, dishId);
  return cart.map((c) => (c.dishId === dishId ? { ...c, number: absoluteNumber } : c));
}

export function totalCount(cart: GuestCartItem[]): number {
  return cart.reduce((sum, c) => sum + c.number, 0);
}

// ==================== Backward-compatible aliases ====================
// 旧名 getLocalCart/addToLocalCart/... 仍被一些老页面使用,保留导出

export const getLocalCart = readLocalCart;

export function addToLocalCart(item: Omit<GuestCartItem, 'number'> & { number?: number }): GuestCartItem[] {
  const next = addItem(readLocalCart(), item);
  writeLocalCart(next);
  return next;
}

export function removeFromLocalCart(dishId: number): GuestCartItem[] {
  const next = removeItem(readLocalCart(), dishId);
  writeLocalCart(next);
  return next;
}

/**
 * @deprecated 用 setQty 替代更直观;本函数是相对增减(delta)
 */
export function updateLocalCartQty(dishId: number, delta: number): GuestCartItem[] {
  const next = updateQty(readLocalCart(), dishId, delta);
  writeLocalCart(next);
  return next;
}

export function getLocalCartCount(): number {
  return totalCount(readLocalCart());
}

/**
 * 登录成功后调:把 localStorage 里的暂存商品批量加到服务端购物车
 * - 顺序追加更稳,避免并发把同一菜品多次 +1 出现数量翻倍
 * - 合并完成后无论成功失败都清空本地暂存(防重复加)
 * - 失败的项目用 onError 回调上报,不影响主流程
 */
export async function mergeLocalCartToServer(
  token: string,
  onError?: (item: GuestCartItem, err: Error) => void,
): Promise<{ merged: number; failed: number }> {
  const cart = readLocalCart();
  if (cart.length === 0) return { merged: 0, failed: 0 };

  let merged = 0;
  let failed = 0;
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