'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  addItem as addToCartPure,
  clearLocalCart,
  readLocalCart,
  removeItem as removeFromCartPure,
  setQty as setQtyPure,
  writeLocalCart,
  type GuestCartItem,
} from '@/lib/cart-storage';
import type { CustomerProfile, User } from '@/types';

interface AuthState {
  customerToken: string | null;
  customerUser: CustomerProfile | null;
  adminToken: string | null;
  adminUser: User | null;
  setCustomerAuth: (token: string, user: CustomerProfile) => void;
  clearCustomerAuth: () => void;
  setAdminAuth: (token: string, user: User) => void;
  clearAdminAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      customerToken: null,
      customerUser: null,
      adminToken: null,
      adminUser: null,
      setCustomerAuth: (customerToken, customerUser) => set({ customerToken, customerUser }),
      clearCustomerAuth: () => set({ customerToken: null, customerUser: null }),
      setAdminAuth: (adminToken, adminUser) => set({ adminToken, adminUser }),
      clearAdminAuth: () => set({ adminToken: null, adminUser: null }),
    }),
    { name: 'auth-store' },
  ),
);

interface CartState {
  items: GuestCartItem[];
  hydrated: boolean;
  hydrate: () => void;
  add: (item: Omit<GuestCartItem, 'number'> & { number?: number }) => void;
  remove: (dishId: number) => void;
  updateQty: (dishId: number, delta: number) => void;
  setQty: (dishId: number, absoluteNumber: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  hydrated: false,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    set({ items: readLocalCart(), hydrated: true });
  },
  add: (item) =>
    set((s) => {
      const next = addToCartPure(s.items, item);
      writeLocalCart(next);
      return { items: next };
    }),
  remove: (dishId) =>
    set((s) => {
      const next = removeFromCartPure(s.items, dishId);
      writeLocalCart(next);
      return { items: next };
    }),
  updateQty: (dishId, delta) =>
    set((s) => {
      const next = s.items
        .map((c) => (c.dishId === dishId ? { ...c, number: c.number + delta } : c))
        .filter((c) => c.number > 0);
      writeLocalCart(next);
      return { items: next };
    }),
  setQty: (dishId, absoluteNumber) =>
    set((s) => {
      const next = setQtyPure(s.items, dishId, absoluteNumber);
      writeLocalCart(next);
      return { items: next };
    }),
  clear: () => {
    clearLocalCart();
    set({ items: [] });
  },
}));