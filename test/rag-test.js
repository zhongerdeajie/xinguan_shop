// 测试 RAG 问答
const http = require('http');

const data = JSON.stringify({ message: '剁椒鱼头热量多少' });
const r = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/v1/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, x => {
  let b = '';
  x.on('data', d => b += d);
  x.on('end', () => console.log(b));
});
r.on('error', e => console.error(e.message));
r.write(data);
r.end();