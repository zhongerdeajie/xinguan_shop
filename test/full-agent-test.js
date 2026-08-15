const http = require('http');

function get(path, port = 5000) {
    return new Promise((resolve, reject) => {
        http.get({ hostname: 'localhost', port, path }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: body }));
        }).on('error', reject);
    });
}

function post(path, body, port = 5000) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: 'localhost',
            port,
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

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ ${name}`);
        passed++;
    } else {
        console.log(`  ❌ ${name} ${detail}`);
        failed++;
    }
}

async function main() {
    console.log('=== 星选 AI 购物管家 - 全 Agent 系统测试 ===\n');

    // 1. 健康检查
    console.log('【1】基础服务');
    const h = await get('/health');
    assert('Python AI 健康', h.status === 200);

    // 2. RAG 检索
    console.log('\n【2】RAG 知识库');
    const s = await post('/api/v1/search', { query: '剁椒鱼头', top_k: 3 });
    assert('语义检索', s.status === 200);
    try {
        const j = JSON.parse(s.body);
        assert('检索结果 > 0', j.results && j.results.length > 0);
        assert('相似度 > 0.5', j.results && j.results[0].score > 0.5);
    } catch (e) { assert('检索结果解析', false); }

    // 3. RAG 问答
    console.log('\n【3】RAG 问答');
    const q = await post('/api/v1/query', { message: '剁椒鱼头是什么菜？' });
    assert('问答接口', q.status === 200);
    try {
        const j = JSON.parse(q.body);
        assert('有回答', j.answer && j.answer.length > 10);
    } catch (e) { assert('回答解析', false); }

    // 4. 意图识别
    console.log('\n【4】意图识别');
    const intents = [
        { msg: '我想点个剁椒鱼头', expected: 'nl_order' },
        { msg: '怎么买最划算', expected: 'smart_bargain' },
        { msg: '剁椒鱼头多少钱', expected: 'price_compare' },
        { msg: '我要退款', expected: 'aftersales' },
        { msg: '搞个满减活动', expected: 'marketing' },
        { msg: '推荐一下', expected: 'recommend' },
    ];
    for (const { msg, expected } of intents) {
        const r = await post('/api/v1/intent', { message: msg });
        try {
            const j = JSON.parse(r.body);
            assert(`"${msg}" → ${expected}`, j.intent === expected, `(got ${j.intent})`);
        } catch (e) { assert(`"${msg}" 意图解析`, false); }
    }

    // 5. Agent 列表
    console.log('\n【5】Agent 列表');
    const a = await get('/api/v1/agents');
    try {
        const j = JSON.parse(a.body);
        assert('6 个 Agent', j.agents && j.agents.length === 6);
    } catch (e) { assert('Agent 列表解析', false); }

    // 6. 各 Agent 路由测试
    console.log('\n【6】Agent 路由测试');
    
    // 6.1 中立推荐
    const rec = await post('/api/v1/chat', { message: '推荐一下', user_id: '1' });
    assert('中立推荐 Agent', rec.status === 200);
    try {
        const j = JSON.parse(rec.body);
        assert('推荐有内容', j.response && j.response.length > 20);
        assert('意图为 recommend', j.intent === 'recommend');
    } catch (e) { assert('推荐解析', false); }

    // 6.2 智能凑单
    const bargain = await post('/api/v1/chat', { message: '怎么买最划算', user_id: '1' });
    assert('智能凑单 Agent', bargain.status === 200);
    try {
        const j = JSON.parse(bargain.body);
        assert('凑单有内容', j.response && j.response.length > 20);
    } catch (e) { assert('凑单解析', false); }

    // 6.3 智能比价
    const price = await post('/api/v1/chat', { message: '剁椒鱼头多少钱', user_id: '1' });
    assert('智能比价 Agent', price.status === 200);
    try {
        const j = JSON.parse(price.body);
        assert('比价有内容', j.response && j.response.length > 20);
    } catch (e) { assert('比价解析', false); }

    // 6.4 智能售后
    const after = await post('/api/v1/chat', { message: '我要退款', user_id: '1' });
    assert('智能售后 Agent', after.status === 200);
    try {
        const j = JSON.parse(after.body);
        assert('售后有内容', j.response && j.response.length > 20);
    } catch (e) { assert('售后解析', false); }

    // 6.5 智能营销
    const market = await post('/api/v1/chat', { message: '搞个满减活动', user_id: '1' });
    assert('智能营销 Agent', market.status === 200);
    try {
        const j = JSON.parse(market.body);
        assert('营销有内容', j.response && j.response.length > 20);
    } catch (e) { assert('营销解析', false); }

    // 6.6 自然语言下单
    const order = await post('/api/v1/chat', { message: '明天晚上6点4个人晚餐预算200', user_id: '1' });
    assert('自然语言下单 Agent', order.status === 200);
    try {
        const j = JSON.parse(order.body);
        assert('下单有内容', j.response && j.response.length > 20);
    } catch (e) { assert('下单解析', false); }

    // 7. Go 服务测试
    console.log('\n【7】Go 服务');
    const goHealth = await get('/api/v1/categories', 8081);
    assert('Go 服务响应', goHealth.status === 200);

    // 8. NestJS 服务测试
    console.log('\n【8】NestJS 服务');
    const nestHealth = await get('/v1/vector/stats', 3000);
    assert('NestJS 服务响应', nestHealth.status === 200);

    // 总结
    console.log(`\n=== 测试结果 ===`);
    console.log(`通过: ${passed}`);
    console.log(`失败: ${failed}`);
    console.log(`总计: ${passed + failed}`);
    console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
}

main().catch(console.error);
