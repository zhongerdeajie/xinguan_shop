// Pure cart-storage unit tests
// Run: npm run test:cart
// Why hand-rolled:
//   - Project has jest in devDependencies but no jest config wired up
//   - These functions are pure (no localStorage / fetch), so a minimal runner is enough
//   - Use Node v24 built-in `node:test` (no extra deps required)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addItem,
  removeItem,
  setQty,
  updateQty,
  totalCount,
  type GuestCartItem,
} from '../cart-storage.ts';

const base: GuestCartItem = { dishId: 1, number: 1, name: '拍黄瓜', price: 12 };

test('addItem: 同 dishId 累加 number', () => {
  const r = addItem([base], { dishId: 1, name: '拍黄瓜', price: 12, number: 1 });
  assert.equal(r[0].number, 2);
});

test('addItem: 新 dishId 追加', () => {
  const r = addItem([base], { dishId: 2, name: '口水鸡', price: 28, number: 3 });
  assert.equal(r.length, 2);
  assert.equal(r[1].number, 3);
});

test('addItem: 未传 number 默认 1', () => {
  const r = addItem([base], { dishId: 99, name: '新品', price: 10 });
  assert.equal(r[r.length - 1].number, 1);
});

test('removeItem: 存在则删除', () => {
  const r = removeItem([base], 1);
  assert.equal(r.length, 0);
});

test('removeItem: 不存在则原样', () => {
  const r = removeItem([base], 99);
  assert.equal(r.length, 1);
});

test('updateQty: 增加', () => {
  const r = updateQty([base], 1, 1);
  assert.equal(r[0].number, 2);
});

test('updateQty: 减少到 0 即移除', () => {
  const r = updateQty([base], 1, -1);
  assert.equal(r.length, 0);
});

test('updateQty: 减少多份也会被移除', () => {
  const r = updateQty([base], 1, -5);
  assert.equal(r.length, 0);
});

test('setQty: 绝对值', () => {
  const r = setQty([base], 1, 9);
  assert.equal(r[0].number, 9);
});

test('setQty: 0 视同删除', () => {
  const r = setQty([base], 1, 0);
  assert.equal(r.length, 0);
});

test('totalCount: 累加 number', () => {
  assert.equal(
    totalCount([
      { dishId: 1, number: 2, name: 'a', price: 1 },
      { dishId: 2, number: 3, name: 'b', price: 1 },
    ]),
    5,
  );
});

test('totalCount: 空数组返回 0', () => {
  assert.equal(totalCount([]), 0);
});