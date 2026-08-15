const http = require('http');
const cp = require('child_process');

function post(port, path, body, hdrs={}) {
  return new Promise((res,rej)=>{
    const data=JSON.stringify(body);
    Object.assign(hdrs, {'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),'X-User-Id':'1'});
    const r=http.request({hostname:'localhost',port,path,method:'POST',headers:hdrs},x=>{let b='';x.on('data',d=>b+=d);x.on('end',()=>res(b?JSON.parse(b):{}))});
    r.on('error',rej);r.write(data);r.end();
  });
}
function get(port,path,hdrs={}) {
  return new Promise((res,rej)=>{
    Object.assign(hdrs,{'X-User-Id':'1'});
    http.get({hostname:'localhost',port,path,headers:hdrs},x=>{let b='';x.on('data',d=>b+=d);x.on('end',()=>res(b?JSON.parse(b):{}))}).on('error',rej);
  });
}

let ok=0, fail=0;
let uid=1, did=0, aid=0, orderNo='', catId=0;
function assert(name,resp,cond){ if(cond){ok++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ '+name+' → '+JSON.stringify(resp).substring(0,200));} }

async function cleanup() {
  console.log('--- 清理测试数据 ---');
  try {
    cp.execSync('docker exec school-system3-mysql-1 sh -c "echo \'SET FOREIGN_KEY_CHECKS=0; DELETE FROM order_detail; DELETE FROM orders; DELETE FROM shopping_cart; DELETE FROM address_book; DELETE FROM user; DELETE FROM dish; DELETE FROM category; DELETE FROM employee; ALTER TABLE user AUTO_INCREMENT=1; ALTER TABLE dish AUTO_INCREMENT=1; ALTER TABLE category AUTO_INCREMENT=1; ALTER TABLE address_book AUTO_INCREMENT=1; ALTER TABLE orders AUTO_INCREMENT=1; ALTER TABLE order_detail AUTO_INCREMENT=1; ALTER TABLE employee AUTO_INCREMENT=1; SET FOREIGN_KEY_CHECKS=1;\' | mysql -uroot -phenu starselect"');
    cp.execSync('docker exec school-system3-redis-1 redis-cli flushdb');
    console.log('  清理完成');
  } catch(e) {
    console.log('  清理失败:', e.message);
  }
}

async function run() {
  console.log('\n========== 星选商城 系统测试 ==========');
  console.log('时间:', new Date().toISOString());
  
  await cleanup();

  // ===== NestJS API 测试 =====
  console.log('\n--- [1/6] NestJS API (3000) ---');
  
  let r = await post(3000,'/v1/categories',{name:'系统测试分类',type:1,sort:1,status:1});
  assert('POST /v1/categories 创建分类', r, r.id>0);
  if(r.id>0) catId=r.id;
  
  r = await post(3000,'/v1/dishes',{name:'系统测试菜品1',price:28,categoryId:catId,status:1});
  assert('POST /v1/dishes 创建菜品', r, r.id>0);
  if(r.id>0) did=r.id;
  
  r = await post(3000,'/v1/dishes',{name:'系统测试菜品2',price:38,categoryId:catId,status:1});
  assert('POST /v1/dishes 创建第二个菜品', r, r.id>0);
  
  r = await get(3000,'/v1/dishes');
  assert('GET /v1/dishes 列表', r, r.data!=undefined);
  
  r = await post(3000,'/v1/employees',{name:'员工A',username:'emp_a',password:'123456',phone:'13800000001',status:1});
  assert('POST /v1/employees 创建员工', r, r.id>0 || r.data!=undefined);
  
  r = await get(3000,'/v1/employees');
  assert('GET /v1/employees 列表', r, r.data!=undefined);
  
  r = await get(3000,'/v1/categories');
  assert('GET /v1/categories 列表', r, r.data!=undefined);
  
  r = await post(3000,'/v1/auth/register',{username:'testuser2',password:'123456',realName:'测试管理员',email:'test2@test.com',phone:'13800000002',role:'admin'});
  assert('POST /v1/auth/register 注册', r, r.statusCode!=500);
  
  r = await post(3000,'/v1/auth/login',{username:'testuser2',password:'123456'});
  assert('POST /v1/auth/login 登录', r, r.token!=undefined || r.data?.token!=undefined);

  // ===== Go API 测试 =====
  console.log('\n--- [2/6] Go API (8081) ---');
  
  r = await post(8081,'/api/v1/users',{name:'Go用户1',phone:'13900000001',sex:'1',idNumber:'110101199001011001',status:1});
  assert('POST /api/v1/users 创建C端用户', r, r.data?.id>0);
  if(r.data?.id>0) uid=r.data.id;
  
  r = await post(8081,'/api/v1/addresses',{userId:uid,consignee:'收件人',phone:'13900000001',provinceName:'湖南',cityName:'长沙',districtName:'岳麓区',detail:'详细地址',isDefault:1});
  assert('POST /api/v1/addresses 创建地址', r, r.data?.id>0);
  if(r.data?.id>0) aid=r.data.id;
  
  r = await get(8081,'/api/v1/users');
  assert('GET /api/v1/users 列表', r, r.data!=undefined);
  
  r = await get(8081,'/api/v1/categories');
  assert('GET /api/v1/categories 列表', r, r.data!=undefined);
  
  r = await get(8081,'/api/v1/dishes');
  assert('GET /api/v1/dishes 列表', r, r.data!=undefined);
  
  // 设置库存
  cp.execSync('docker exec school-system3-redis-1 redis-cli set dish:'+did+':stock 50');
  r = await post(8081,'/api/v1/cart/add',{dishId:did,number:1,dishFlavor:'微辣'});
  assert('POST /api/v1/cart/add 添加购物车', r, r.message==='添加成功');
  
  r = await get(8081,'/api/v1/cart');
  assert('GET /api/v1/cart 查看购物车', r, r.data!=undefined);
  
  r = await post(8081,'/api/v1/orders/submit',{addressBookId:aid,remark:'测试',payMethod:1});
  assert('POST /api/v1/orders/submit 提交订单', r, r.data?.orderNumber!=undefined);
  if(r.data?.orderNumber) orderNo=r.data.orderNumber;
  
  r = await get(8081,'/api/v1/orders');
  assert('GET /api/v1/orders 查询订单列表', r, r.data?.total>0);
  
  if(orderNo) {
    r = await post(8081,'/api/v1/payment/pay',{orderNumber:orderNo,payMethod:1});
    assert('POST /api/v1/payment/pay 支付订单', r, r.message!=undefined && !r.error);
  }

  // ===== Python AI 测试 =====
  console.log('\n--- [3/6] Python AI (5000) ---');
  
  r = await get(5000,'/health');
  assert('GET /health 健康检查', r, r.status==='ok');
  
  r = await post(5000,'/api/v1/vector/index',{texts:['测试文档1','测试文档2'],ids:['1','2']});
  assert('POST /api/v1/vector/index 向量化', r, r.success!=false);
  
  r = await get(5000,'/api/v1/vector/stats');
  assert('GET /api/v1/vector/stats 向量统计', r, r.success!=false);

  // ===== ChromaDB 测试 =====
  console.log('\n--- [4/6] ChromaDB (8000) ---');
  
  r = await get(8000,'/api/v1/heartbeat');
  assert('GET /api/v1/heartbeat 心跳', r, r['nanosecond heartbeat']!=undefined);

  // ===== Next.js BFF 测试 =====
  console.log('\n--- [5/6] Next.js (3001) ---');
  
  const https=require('https');
  const httpx=require('http');
  const fetch = (url)=>new Promise((res,rej)=>{
    const mod = url.startsWith('https')?https:httpx;
    mod.get(url,resp=>{let b='';resp.on('data',d=>b+=d);resp.on('end',()=>res({status:resp.statusCode,len:b.length}))}).on('error',rej)
  });
  
  let resp = await fetch('http://localhost:3001/');
  assert('GET / Next.js BFF 首页', resp, resp.status===200 && resp.len>0);

  // ===== Vue Admin 测试 =====
  console.log('\n--- [6/6] Vue Admin (5173) ---');
  resp = await fetch('http://localhost:5173/');
  assert('GET / Vue Admin 首页', resp, resp.status===200 && resp.len>0);
  
  // ===== 基础设施测试 =====
  console.log('\n--- [补充] 基础设施 ---');
  try {
    cp.execSync('docker exec school-system3-redis-1 redis-cli ping');
    assert('Redis 连接', {}, true);
  } catch(e) { assert('Redis 连接', {}, false); }
  
  try {
    cp.execSync('docker exec school-system3-mysql-1 mysqladmin -uroot -phenu ping');
    assert('MySQL 连接', {}, true);
  } catch(e) { assert('MySQL 连接', {}, false); }

  console.log('\n=== 系统测试结果: '+ok+' 通过, '+fail+' 失败 ===');
  if(fail>0) console.log('⚠  存在失败项，请检查上方 ✗ 标记');
  else console.log('🎉 全部测试通过！');
}
run().catch(e=>{console.error('异常:',e.message);process.exit(1)});
