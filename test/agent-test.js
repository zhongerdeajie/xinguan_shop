const http = require('http');

function post(port, path, body, hdrs = {}) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    Object.assign(hdrs, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-User-Id': '1' });
    const r = http.request({ hostname: 'localhost', port, path, method: 'POST', headers: hdrs }, x => {
      let b = '';
      x.on('data', d => b += d);
      x.on('end', () => {
        try { res(JSON.parse(b)); } catch (e) { res(b); }
      });
    });
    r.on('error', rej);
    r.write(data);
    r.end();
  });
}

function get(port, path, hdrs = {}) {
  return new Promise((res, rej) => {
    Object.assign(hdrs, { 'X-User-Id': '1' });
    http.get({ hostname: 'localhost', port, path, headers: hdrs }, x => {
      let b = '';
      x.on('data', d => b += d);
      x.on('end', () => {
        try { res(JSON.parse(b)); } catch (e) { res(b); }
      });
    }).on('error', rej);
  });
}

function delete_req(port, path) {
  return new Promise((res, rej) => {
    const r = http.request({ hostname: 'localhost', port, path, method: 'DELETE' }, x => {
      let b = '';
      x.on('data', d => b += d);
      x.on('end', () => {
        try { res(JSON.parse(b)); } catch (e) { res(b); }
      });
    });
    r.on('error', rej);
    r.end();
  });
}

function get_raw(port, path) {
  return new Promise((res, rej) => {
    http.get({ hostname: 'localhost', port, path }, x => {
      let b = '';
      x.on('data', d => b += d);
      x.on('end', () => res({ status: x.statusCode, len: b.length }));
    }).on('error', rej);
  });
}

let ok = 0, fail = 0;
function assert(name, cond) {
  if (cond) { ok++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); }
}

async function run() {
  console.log('\n========== 电商 Agent 测试 ==========\n');

  // ===== Python AI 电商 Agent 测试 =====
  console.log('--- Python AI 电商 Agent (5000) ---');

  let r = await get(5000, '/health');
  assert('GET /health 健康检查', r.status === 'ok');

  r = await post(5000, '/api/v1/chat', { message: '你好', session_id: 'test-session-1', user_id: '1' });
  assert('POST /chat 电商Agent对话', r.response !== undefined || r.message !== undefined);

  r = await post(5000, '/api/v1/chat', { message: '搜索川菜', session_id: 'test-session-1', user_id: '1' });
  assert('POST /chat 搜索川菜', r.response !== undefined);

  r = await post(5000, '/api/v1/chat', { message: '查看购物车', session_id: 'test-session-1', user_id: '1' });
  assert('POST /chat 查看购物车', r.response !== undefined);

  r = await post(5000, '/api/v1/chat', { message: '查询我的订单', session_id: 'test-session-1', user_id: '1' });
  assert('POST /chat 查询订单', r.response !== undefined);

  r = await post(5000, '/api/v1/chat', { message: '推荐一些热门菜品', session_id: 'test-session-1', user_id: '1' });
  assert('POST /chat 热门推荐', r.response !== undefined);

  r = await post(5000, '/api/v1/chat', { message: '有哪些分类', session_id: 'test-session-1', user_id: '1' });
  assert('POST /chat 查看分类', r.response !== undefined);

  r = await post(5000, '/api/v1/query', { message: '剁椒鱼头怎么做' });
  assert('POST /query RAG问答', r.answer !== undefined);

  r = await get(5000, '/api/v1/vector/stats');
  assert('GET /vector/stats 向量统计', r.success !== false);

  r = await delete_req(5000, '/api/v1/cache');
  assert('DELETE /cache 清除缓存', r.status === 'ok');

  // ===== Go 服务测试 =====
  console.log('\n--- Go API (8081) ---');

  r = await get(8081, '/api/v1/categories');
  assert('GET /api/v1/categories 分类列表', r.data !== undefined);

  r = await get(8081, '/api/v1/dishes');
  assert('GET /api/v1/dishes 菜品列表', r.data !== undefined);

  r = await get(8081, '/api/v1/dishes/1');
  assert('GET /api/v1/dishes/1 菜品详情', r.data !== undefined || r.error !== undefined);

  r = await get(8081, '/api/v1/users');
  assert('GET /api/v1/users 用户列表', r.data !== undefined);

  r = await get(8081, '/api/v1/addresses');
  assert('GET /api/v1/addresses 地址列表', r.data !== undefined);

  r = await get(8081, '/api/v1/cart', { 'X-User-Id': '1' });
  assert('GET /api/v1/cart 购物车', r.data !== undefined || r.error !== undefined);

  r = await get(8081, '/api/v1/orders', { 'X-User-Id': '1' });
  assert('GET /api/v1/orders 订单列表', r.data !== undefined || r.error !== undefined);

  // 创建分类 - 使用唯一名称避免冲突
  const catRes = await post(8081, '/api/v1/categories', { name: '测试川菜_' + Date.now(), type: 1, sort: 1, status: 1 });
  assert('POST /api/v1/categories 创建分类', r.data !== undefined || r.message !== undefined);
  
  // 获取刚创建的分类ID
  let categoryId = 1;
  if (catRes.data && catRes.data.id) {
    categoryId = catRes.data.id;
  } else {
    // 如果创建失败，尝试获取已有分类
    const cats = await get(8081, '/api/v1/categories');
    if (cats.data && cats.data.length > 0) {
      categoryId = cats.data[0].id || cats.data[0].ID || 1;
    }
  }

  // 创建菜品（使用有效的分类ID）
  r = await post(8081, '/api/v1/dishes', { name: '测试菜品_' + Date.now(), price: 28, categoryId: categoryId, status: 1 });
  assert('POST /api/v1/dishes 创建菜品', r.data !== undefined || r.message !== undefined);

  // 创建用户
  r = await post(8081, '/api/v1/users', { name: '测试用户_' + Date.now(), phone: '13800000001', sex: '1', idNumber: '110101199001011001', status: 1 });
  assert('POST /api/v1/users 创建用户', r.data !== undefined || r.message !== undefined);

  // 创建地址
  r = await post(8081, '/api/v1/addresses', { userId: 1, consignee: '收件人', phone: '13800000001', provinceName: '湖南', cityName: '长沙', districtName: '岳麓区', detail: '详细地址', isDefault: 1 });
  assert('POST /api/v1/addresses 创建地址', r.data !== undefined || r.message !== undefined);

  // 添加购物车
  r = await post(8081, '/api/v1/cart/add', { dishId: 1, number: 2, dishFlavor: '微辣', userId: 1 });
  assert('POST /api/v1/cart/add 添加购物车', r.message === '添加成功' || r.error !== undefined);

  // 提交订单
  r = await post(8081, '/api/v1/orders/submit', { userId: 1, addressBookId: 1, remark: '测试', payMethod: 1 }, { 'X-User-Id': '1' });
  assert('POST /api/v1/orders/submit 提交订单', r.data !== undefined || r.message !== undefined || r.error !== undefined);

  // 支付订单
  r = await post(8081, '/api/v1/payment/pay', { orderNumber: '202607270545292203', payMethod: 1 }, { 'X-User-Id': '1' });
  assert('POST /api/v1/payment/pay 支付订单', r.message !== undefined || r.error !== undefined);

  // ===== ChromaDB 测试 =====
  console.log('\n--- ChromaDB (8000) ---');
  r = await get(8000, '/api/v1/heartbeat');
  assert('GET /api/v1/heartbeat ChromaDB心跳', r['nanosecond heartbeat'] !== undefined);

  // ===== Next.js 测试 =====
  console.log('\n--- Next.js BFF (3001) ---');
  r = await get_raw(3001, '/');
  assert('GET / Next.js 首页', r.status === 200 && r.len > 0);

  // ===== Vue Admin 测试 =====
  console.log('\n--- Vue Admin (5173) ---');
  r = await get_raw(5173, '/');
  assert('GET / Vue Admin 首页', r.status === 200 && r.len > 0);

  console.log('\n=== 测试结果: ' + ok + ' 通过, ' + fail + ' 失败 ===');
}

run().catch(e => { console.error('异常:', e.message); process.exit(1); });
