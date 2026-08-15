const http = require('http');
const cp = require('child_process');

function get(port, path) {
  return new Promise((res,rej)=>{
    http.get({hostname:'localhost',port,path},x=>{let b='';x.on('data',d=>b+=d);x.on('end',()=>res({status:x.statusCode,len:b.length,body:b?JSON.parse(b):{}}))}).on('error',rej);
  });
}
function post(port, path, body, hdrs={}) {
  return new Promise((res,rej)=>{
    const data=JSON.stringify(body);
    Object.assign(hdrs, {'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),'X-User-Id':'1'});
    const r=http.request({hostname:'localhost',port,path,method:'POST',headers:hdrs},x=>{let b='';x.on('data',d=>b+=d);x.on('end',()=>res(b?JSON.parse(b):{}))});
    r.on('error',rej);r.write(data);r.end();
  });
}

let ok=0, fail=0;
function assert(name,cond){ if(cond){ok++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ '+name);} }

async function cleanup() {
  console.log('--- 清理测试数据 ---');
  try {
    cp.execSync('docker exec school-system3-mysql-1 sh -c "echo \'SET FOREIGN_KEY_CHECKS=0; DELETE FROM order_detail; DELETE FROM orders; DELETE FROM shopping_cart; DELETE FROM address_book; DELETE FROM user; DELETE FROM dish; DELETE FROM category; DELETE FROM employee; ALTER TABLE user AUTO_INCREMENT=1; ALTER TABLE dish AUTO_INCREMENT=1; ALTER TABLE category AUTO_INCREMENT=1; ALTER TABLE address_book AUTO_INCREMENT=1; ALTER TABLE orders AUTO_INCREMENT=1; ALTER TABLE order_detail AUTO_INCREMENT=1; ALTER TABLE employee AUTO_INCREMENT=1; SET FOREIGN_KEY_CHECKS=1;\' | mysql -uroot -phenu starselect"');
    cp.execSync('docker exec school-system3-redis-1 redis-cli flushdb');
    console.log('  清理完成');
  } catch(e) { console.log('  清理:', e.message); }
}

async function run() {
  console.log('\n========== 星选商城 故障恢复测试 ==========');
  console.log('时间:', new Date().toISOString());
  
  await cleanup();
  
  console.log('\n--- [1/4] 服务重启恢复 ---');
  
  console.log('  重启 Go 服务...');
  cp.execSync('docker restart school-system3-go-service-1');
  await new Promise(r => setTimeout(r, 5000));
  let r = await get(8081, '/api/v1/users');
  assert('Go 服务重启后恢复', r.status===200);
  
  console.log('  重启 NestJS 服务...');
  cp.execSync('docker restart school-system3-nestjs-api-1');
  await new Promise(r => setTimeout(r, 15000));
  r = await get(3000, '/v1/dishes');
  assert('NestJS 服务重启后恢复', r.status===200);
  
  console.log('\n--- [2/4] 数据一致性 ---');
  let resp = await post(8081,'/api/v1/users',{name:'一致性测试',phone:'13900000002',sex:'1',idNumber:'110101199001011002',status:1});
  const newId = resp.data?.id;
  assert('创建用户成功', newId>0);
  
  if(newId) {
    r = await get(8081, '/api/v1/users');
    assert('创建后立即可查询', r.body?.data?.total>0);
  }
  
  console.log('\n--- [3/4] 容器健康状态 ---');
  const containers = ['school-system3-mysql-1','school-system3-redis-1','school-system3-nestjs-api-1','school-system3-go-service-1','school-system3-python-ai-1','school-system3-next-web-1','school-system3-vue-admin-1'];
  for (const c of containers) {
    try {
      const status = cp.execSync('docker inspect --format="{{.State.Status}}" ' + c).toString().trim();
      assert('容器 ' + c.substring(c.lastIndexOf('-')+1) + ' 运行中', status==='running');
    } catch(e) {
      assert('容器 ' + c.substring(c.lastIndexOf('-')+1) + ' 运行中', false);
    }
  }
  
  console.log('\n--- [4/4] 网络连通性 ---');
  r = await get(3000, '/v1/dishes');
  assert('NestJS → MySQL 连通', r.status===200);
  r = await get(8081, '/api/v1/users');
  assert('Go → MySQL 连通', r.status===200);
  r = await get(5000, '/health');
  assert('Python AI → ChromaDB 连通', r.status===200);
  
  console.log('\n=== 故障恢复测试结果: '+ok+' 通过, '+fail+' 失败 ===');
}
run().catch(e=>{console.error('异常:',e.message);process.exit(1)});
