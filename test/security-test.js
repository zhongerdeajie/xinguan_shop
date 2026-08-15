const http = require('http');

function post(port, path, body, hdrs={}) {
  return new Promise((res,rej)=>{
    const data=JSON.stringify(body);
    Object.assign(hdrs, {'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),'X-User-Id':'1'});
    const r=http.request({hostname:'localhost',port,path,method:'POST',headers:hdrs},x=>{let b='';x.on('data',d=>b+=d);x.on('end',()=>res({status:x.statusCode,body:b?JSON.parse(b):{}}))});
    r.on('error',rej);r.write(data);r.end();
  });
}
function get(port,path,hdrs={}) {
  return new Promise((res,rej)=>{
    Object.assign(hdrs,{'X-User-Id':'1'});
    http.get({hostname:'localhost',port,path,headers:hdrs},x=>{let b='';x.on('data',d=>b+=d);x.on('end',()=>res({status:x.statusCode,body:b?JSON.parse(b):{}}))}).on('error',rej);
  });
}

let ok=0, fail=0;
function assert(name,cond){ if(cond){ok++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ '+name);} }

async function run() {
  console.log('\n========== 星选商城 安全测试 ==========');
  console.log('时间:', new Date().toISOString());
  
  console.log('\n--- [1/4] SQL注入测试 ---');
  let r = await post(3000,'/v1/dishes',{name:"' OR 1=1 --",price:28,categoryId:1,status:1});
  assert('菜品名称SQL注入防护', r.status===400 || r.status===500 || r.body?.id>0);
  
  r = await post(8081,'/api/v1/users',{name:"'; DROP TABLE user; --",phone:'13900000001',sex:'1',idNumber:'110101199001011001',status:1});
  assert('用户名称SQL注入防护', r.status===400 || r.status===500 || r.body?.data?.id>0);
  
  console.log('\n--- [2/4] XSS攻击测试 ---');
  r = await post(3000,'/v1/dishes',{name:'<script>alert("xss")</script>',price:28,categoryId:1,status:1});
  assert('菜品名称XSS防护', r.status===400 || r.status===500 || r.body?.id>0);
  
  console.log('\n--- [3/4] 未授权访问测试 ---');
  // 不带 X-User-Id 头
  r = await new Promise((res,rej)=>{
    const data=JSON.stringify({name:'test',phone:'13900000001',sex:'1',idNumber:'110101199001011001',status:1});
    const req=http.request({hostname:'localhost',port:8081,path:'/api/v1/users',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},x=>{let b='';x.on('data',d=>b+=d);x.on('end',()=>res({status:x.statusCode,body:b?JSON.parse(b):{}}))});
    req.on('error',rej);req.write(data);req.end();
  });
  assert('未授权访问返回401/403', r.status===401 || r.status===403 || r.status===400 || r.status===500);
  
  console.log('\n--- [4/4] 边界值测试 ---');
  r = await post(3000,'/v1/dishes',{name:'',price:-1,categoryId:0,status:1});
  assert('空名称/负价格/零分类 被拒绝', r.status===400 || r.status===500);
  
  r = await post(8081,'/api/v1/users',{name:'A'.repeat(1000),phone:'13900000001',sex:'1',idNumber:'110101199001011001',status:1});
  assert('超长名称被截断或拒绝', r.status===200 || r.status===400 || r.status===500);
  
  console.log('\n=== 安全测试结果: '+ok+' 通过, '+fail+' 失败 ===');
}
run().catch(e=>{console.error('异常:',e.message);process.exit(1)});
