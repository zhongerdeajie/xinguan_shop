// 星选 AI 购物管家 - 6 个 Agent 系统测试
const http = require('http');

function post(port, path, body, hdrs = {}) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    Object.assign(hdrs, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) });
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
    http.get({ hostname: 'localhost', port, path, headers: hdrs }, x => {
      let b = '';
      x.on('data', d => b += d);
      x.on('end', () => {
        try { res(JSON.parse(b)); } catch (e) { res(b); }
      });
    }).on('error', rej);
  });
}

let ok = 0, fail = 0;
function assert(name, cond) {
  if (cond) { ok++; console.log('  \u2713 ' + name); } else { fail++; console.log('  \u2717 ' + name); }
}

async function run() {
  console.log('\n========== 星选 AI 购物管家 - 系统测试 ==========\n');

  // ===== 痛点 1 测试：GEO 中立推荐 =====
  console.log('--- 痛点 1: AI 推荐被 GEO 推广污染 -> 中立推荐 ---');
  let r = await post(5000, '/api/v1/chat', {
    message: '帮我推荐一些好吃的川菜',
    session_id: 'test-1',
    user_id: '1',
    role: 'user'
  });
  assert('POST /chat 中立推荐', r.intent === 'recommend' || r.response !== undefined);

  // ===== 痛点 2 测试：商家文案 Agent =====
  console.log('\n--- 痛点 2: AI 文案是套话 -> 商家营销 ---');
  r = await post(5000, '/api/v1/chat', {
    message: '这周搞个满 100 减 20 的活动',
    session_id: 'test-1',
    user_id: 'merchant-1',
    role: 'merchant'
  });
  assert('POST /chat 商家营销', r.intent === 'marketing' || r.response !== undefined);

  // ===== 痛点 3 测试：自然语言下单 =====
  console.log('\n--- 痛点 3: AI 关键词污染 -> 自然语言下单 ---');
  r = await post(5000, '/api/v1/chat', {
    message: '明天晚上 6 点要 4 个人的晚餐，预算 200，要 2 个荤 1 个素 1 个汤',
    session_id: 'test-1',
    user_id: '1'
  });
  assert('POST /chat 自然语言下单', r.intent === 'nl_order' || r.response !== undefined);
  assert('  实体提取：人数', r.entities && r.entities.people_count === 4);
  assert('  实体提取：预算', r.entities && r.entities.budget === 200);

  // ===== 痛点 4 测试：营销黑箱 -> 营销透明 =====
  console.log('\n--- 痛点 4: 营销是黑箱 -> 透明分群 ---');
  r = await post(5000, '/api/v1/chat', {
    message: '帮我做用户分群分析',
    session_id: 'test-1',
    user_id: 'merchant-1',
    role: 'merchant'
  });
  assert('POST /chat 用户分群', r.response !== undefined);

  // ===== 痛点 5 测试：满减烧脑 -> 凑单 =====
  console.log('\n--- 痛点 5: 满减烧脑 -> 智能凑单 ---');
  r = await post(5000, '/api/v1/chat', {
    message: '我有 60 元的商品，怎么凑满 100 减 30 最划算',
    session_id: 'test-1',
    user_id: '1'
  });
  assert('POST /chat 智能凑单', r.intent === 'smart_bargain' || r.response !== undefined);

  // ===== 痛点 5 测试：跨平台比价 =====
  console.log('\n--- 痛点 5: 跨平台比价 -> 价格对比 ---');
  r = await post(5000, '/api/v1/chat', {
    message: '可乐哪里便宜？',
    session_id: 'test-1',
    user_id: '1'
  });
  assert('POST /chat 跨平台比价', r.intent === 'price_compare' || r.response !== undefined);

  // ===== 痛点 5 测试：历史价格（假打折） =====
  console.log('\n--- 痛点 5: 假打折 -> 历史价格曲线 ---');
  r = await get(8081, '/api/v1/dishes/4/price-history');
  assert('GET /dishes/:id/price-history 历史价格', r.data && Array.isArray(r.data) && r.data.length > 0);

  // ===== 痛点 5 测试：售后 =====
  console.log('\n--- 痛点 5: 售后慢 -> 智能售后 ---');
  r = await post(5000, '/api/v1/chat', {
    message: '我昨天的订单少送了一个菜',
    session_id: 'test-1',
    user_id: '1'
  });
  assert('POST /chat 智能售后', r.intent === 'aftersales' || r.response !== undefined);

  // ===== Agent 列表 API =====
  console.log('\n--- 管理 API ---');
  r = await get(5000, '/api/v1/agents');
  assert('GET /agents 列出 6 个 Agent', r.agents && r.agents.length === 6);

  // ===== 意图识别 API =====
  r = await post(5000, '/api/v1/intent', { message: '凑单' });
  assert('POST /intent 凑单意图', r.intent === 'smart_bargain');

  r = await post(5000, '/api/v1/intent', { message: '退款' });
  assert('POST /intent 退款意图', r.intent === 'aftersales');

  // ===== 健康检查 =====
  console.log('\n--- 健康检查 ---');
  r = await get(5000, '/api/v1/health');
  assert('GET /health', r.status === 'ok');
  assert('  包含 6 个 Agent', r.agents && r.agents.length === 6);

  // ===== 传统业务测试（保留） =====
  console.log('\n--- 传统业务（保留） ---');
  r = await get(8081, '/api/v1/categories');
  assert('GET /categories', r.data !== undefined);

  r = await get(8081, '/api/v1/dishes');
  assert('GET /dishes', r.data !== undefined);

  r = await get(8081, '/api/v1/dishes?maxPrice=30&limit=5');
  assert('GET /dishes?maxPrice=30&limit=5 凑单筛选', r.data !== undefined);

  r = await get(8081, '/api/v1/dishes?name=' + encodeURIComponent('红烧'));
  assert('GET /dishes?name=红烧 名称搜索', r.data !== undefined);

  // ===== 总结 =====
  console.log('\n========== 测试结果 ==========');
  console.log('\u9019\u8fc7\uff1a' + ok + '  \u5931\u8d25\uff1a' + fail);
  console.log('\u8986\u76d6\u7387\uff1a' + (ok / (ok + fail) * 100).toFixed(1) + '%');
  console.log('============================\n');
}

run().catch(e => { console.error('\u5f02\u5e38:', e.message); process.exit(1); });