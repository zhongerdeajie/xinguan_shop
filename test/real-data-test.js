// 真实数据驱动的 RAG 验证测试 - 使用 search 接口
const http = require('http');

function post(path, body, port = 5000) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: 'localhost', port, path, method: 'POST',
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

let passed = 0, failed = 0;

function assert(name, condition, detail = '') {
    if (condition) { console.log(`  [OK] ${name}`); passed++; }
    else { console.log(`  [FAIL] ${name} ${detail}`); failed++; }
}

async function testRetrieval(name, question, expectedKeywords) {
    console.log(`\n[${name}] ${question}`);
    const r = await post('/api/v1/search', { query: question, top_k: 3 });
    try {
        const j = JSON.parse(r.body);
        const allText = (j.results || []).map(r => r.content).join('\n');
        const has = expectedKeywords.some(kw => allText.includes(kw));
        assert(`检索到包含 (${expectedKeywords.join('/')}) 的文档`, has);
        if (has) {
            const top = j.results[0];
            console.log(`     最高分: ${top.score.toFixed(3)}`);
            console.log(`     [${top.entity_type}] ${top.content.substring(0, 80)}...`);
        }
    } catch (e) { assert('响应可解析', false); }
}

async function main() {
    console.log('=' .repeat(60));
    console.log('星选 AI 购物管家 - 真实数据 RAG 检索验证');
    console.log('=' .repeat(60));

    // 痛点1: GEO投毒 - 央视3.15 2026 证据
    await testRetrieval('痛点1', 'AI 推荐被污染 GEO 投毒', ['3.15', 'GEO', '1000', '投毒']);

    // 痛点2: AI套话
    await testRetrieval('痛点2', 'AI 文案 套话 商家', ['套话', '匠心', '真实评价']);

    // 痛点3: 假打折 - 中消协权威数据
    await testRetrieval('痛点3-中消协', '中消协 双11 假打折 78%', ['中消协', '78', '539']);
    await testRetrieval('痛点3-UF', '美国零售 假打折 76% UF', ['UF', '21家', '零售']);

    // 痛点4: 营销黑箱
    await testRetrieval('痛点4', '商家 黑箱 GEO 玄学', ['黑箱', '林芷', 'GEO']);

    // 痛点5: 凑单/比价/售后
    await testRetrieval('痛点5-凑单', '凑单 9 折 反而更贵', ['9 折', '凑单', '500']);
    await testRetrieval('痛点5-比价', '如何判断真打折 历史价格', ['90天', '0.9', '历史']);
    await testRetrieval('痛点5-千人千价', '千人千价 大数据杀熟 88VIP', ['千人千价', '杀熟', '88VIP']);
    await testRetrieval('痛点5-售后', '售后 少送漏发 自动退款', ['少送', '500', '识别']);

    // 商品 RAG
    await testRetrieval('商品', '剁椒鱼头', ['剁椒鱼头', '鱼肉嫩', '评分']);

    console.log('\n' + '=' .repeat(60));
    console.log(`[PASS] ${passed}, [FAIL] ${failed}, 总计 ${passed+failed}, 通过率 ${passed === 0 || failed === 0 ? 0 : ((passed/(passed+failed))*100).toFixed(1)}%`);
    console.log('=' .repeat(60));

    if (passed === failed + passed) {
        console.log('\n[OK] 所有痛点都有真实数据证据支撑');
        console.log('   数据源：中消协 + 新华网 + 央视3.15 + UF大学 + HBS + 黑猫投诉');
    }
}

main().catch(console.error);
