const http = require('http');

function post(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: 'localhost',
            port: 5000,
            path,
            method: 'POST',
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

function get(path) {
    return new Promise((resolve, reject) => {
        http.get({ hostname: 'localhost', port: 5000, path }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: body }));
        }).on('error', reject);
    });
}

async function main() {
    console.log('=== RAG 检索测试 ===');
    
    // 1. 健康检查
    const h = await get('/health');
    console.log('1. /health:', h.status, h.body.substring(0, 100));
    
    // 2. 语义检索
    const s = await post('/api/v1/search', { query: '剁椒鱼头', top_k: 3 });
    console.log('2. /search:', s.status);
    try {
        const j = JSON.parse(s.body);
        console.log('   结果数:', j.results ? j.results.length : 0);
        if (j.results && j.results.length > 0) {
            console.log('   第一条:', j.results[0].content.substring(0, 80) + '...');
            console.log('   相似度:', j.results[0].score);
        }
    } catch (e) { console.log('   原始:', s.body.substring(0, 200)); }
    
    // 3. RAG 问答
    const q = await post('/api/v1/query', { message: '剁椒鱼头是什么菜？' });
    console.log('3. /query:', q.status);
    try {
        const j = JSON.parse(q.body);
        console.log('   回答:', j.answer ? j.answer.substring(0, 200) : '无');
    } catch (e) { console.log('   原始:', q.body.substring(0, 200)); }
    
    // 4. 意图识别
    const i = await post('/api/v1/intent', { message: '我想点个剁椒鱼头' });
    console.log('4. /intent:', i.status);
    try {
        const j = JSON.parse(i.body);
        console.log('   意图:', j.intent, 'Agent:', j.agent_name);
    } catch (e) { console.log('   原始:', i.body.substring(0, 200)); }
    
    // 5. Agent 列表
    const a = await get('/api/v1/agents');
    console.log('5. /agents:', a.status, a.body.substring(0, 200));
}

main().catch(console.error);
