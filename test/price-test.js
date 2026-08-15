// 测试价格历史
const http = require('http');
http.get('http://localhost:8081/api/v1/dishes/4/price-history', x => {
  let b = '';
  x.on('data', d => b += d);
  x.on('end', () => console.log(b));
});