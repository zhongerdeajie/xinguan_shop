// 简易测试脚本
const http = require('http');

function post(path, body) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const r = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, x => {
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

post('/api/v1/chat', { message: '帮我推荐', user_id: '1' })
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.error(e.message));