// 端到端 smoke: WS 推送 + 下单验证 (Pub/Sub 方案 B 跑通版)
const { io } = require('socket.io-client');

async function http(method, url, opts = {}) {
  const res = await fetch(url, { method, headers: opts.headers || {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}

(async () => {
  const adminLogin = await http('POST', 'http://localhost:3000/v1/auth/login', {
    headers: { 'Content-Type': 'application/json' },
    body: { username: 'admin', password: '123456' },
  });
  const adminToken = adminLogin.json?.token;

  const custLogin = await http('POST', 'http://localhost:3000/v1/auth/customer/login', {
    headers: { 'Content-Type': 'application/json' },
    body: { phone: '13800000002', password: '123456' },
  });
  const customerToken = custLogin.json?.token;

  // socket.io-client 必须带 Authorization header (NestJS 从 header 取 token)
  const socket = io('http://localhost:3000/ws/admin-orders', {
    transports: ['websocket', 'polling'],
    auth: { token: adminToken },
    extraHeaders: { Authorization: `Bearer ${adminToken}` },
  });
  let receivedOrder = null;
  socket.on('connect', () => console.log(`✅ WS connected: ${socket.id}`));
  socket.on('order:new', (o) => { receivedOrder = o; console.log(`🎉 order:new: id=${o.id} amount=${o.amount}`); });
  socket.on('connect_error', (err) => console.log(`❌ connect_error: ${err.message}`));

  await new Promise(r => setTimeout(r, 2000));

  const addr = await http('GET', 'http://localhost:8081/api/v1/addresses', {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const addressId = (addr.json?.data || addr.json || [])[0]?.id;

  const submit = await http('POST', 'http://localhost:8081/api/v1/orders/submit', {
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: { addressBookId: addressId, payMethod: 1, remark: 'WS Pub/Sub smoke' },
  });
  console.log(`submit: status=${submit.status} orderId=${submit.json?.data?.id}`);

  await new Promise(r => setTimeout(r, 4000));
  if (receivedOrder) {
    console.log(`\n🎉 Go Publish -> Redis Pub/Sub -> NestJS Gateway -> socket.io -> 客户端 ✅`);
  } else {
    console.log(`\n❌ WS 4 秒内没收到推送`);
  }
  socket.close();
  process.exit(receivedOrder ? 0 : 1);
})();