const http = require('http');
function post(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: 'localhost', port: 5000, path, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: body }));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

post('/api/v1/search', { query: '商家 AI 推荐', top_k: 3 }).then(r => {
    const j = JSON.parse(r.body);
    j.results.forEach(rs => console.log(rs.score.toFixed(3), rs.entity_type, rs.content.substring(0, 80)));
});
