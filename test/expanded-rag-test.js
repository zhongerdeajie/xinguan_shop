// 扩充后的真实数据 RAG 验证 - 覆盖全部场景
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

function assert(name, cond, detail = '') {
    if (cond) { console.log(`  [OK] ${name}`); passed++; }
    else { console.log(`  [FAIL] ${name} ${detail}`); failed++; }
}

async function testRetrieval(name, question, expectedKeywords) {
    console.log(`\n[${name}] ${question}`);
    const r = await post('/api/v1/search', { query: question, top_k: 3 });
    try {
        const j = JSON.parse(r.body);
        const allText = (j.results || []).map(r => r.content).join('\n');
        const has = expectedKeywords.some(kw => allText.includes(kw));
        assert(`检索到 (${expectedKeywords.join('/')})`, has);
        if (has) {
            const top = j.results[0];
            console.log(`     ${top.score.toFixed(3)} [${top.entity_type}] ${top.content.substring(0, 70)}...`);
        }
    } catch (e) { assert('响应可解析', false); }
}

async function main() {
    console.log('=' .repeat(60));
    console.log('星选 AI 购物管家 - 扩充版 真实数据 RAG 验证 (107篇文档)');
    console.log('=' .repeat(60));

    console.log('\n========== 5 大痛点核心证据 ==========');
    await testRetrieval('痛点1 GEO 投毒', 'AI 推荐 GEO 投毒产业链', ['3.15', 'GEO', '1000', '产业链']);
    await testRetrieval('痛点2 AI 套话', 'AI 文案 套话 真实评价', ['套话', '匠心', '真实评价', '60%']);
    await testRetrieval('痛点3 假打折', '中消协 假打折 78%', ['中消协', '78.1', '539']);
    await testRetrieval('痛点3 美国对比', '美国零售商 假打折 跟踪', ['UF', '21家', '84%']);
    await testRetrieval('痛点4 黑箱', '商家 黑箱 GEO 玄学', ['黑箱', '林芷', 'GEO']);
    await testRetrieval('痛点5 凑单', '凑单 反而更贵', ['凑单', '9 折', '500']);
    await testRetrieval('痛点5 千人千价', '千人千价 88VIP', ['千人千价', '杀熟', '88VIP']);

    console.log('\n========== 30+ 真实菜品（按菜系） ==========');
    await testRetrieval('湘菜', '剁椒鱼头 农家小炒肉', ['剁椒鱼头', '鱼肉嫩']);
    await testRetrieval('粤菜', '白切鸡 烧鹅 叉烧', ['白切鸡', '皮爽肉滑']);
    await testRetrieval('川菜', '回锅肉 麻婆豆腐 酸菜鱼', ['回锅肉', '麻婆豆腐']);
    await testRetrieval('鲁菜', '糖醋鲤鱼 九转大肠', ['糖醋', '葱烧海参']);
    await testRetrieval('闽菜', '佛跳墙 海蛎煎', ['佛跳墙', '海蛎']);
    await testRetrieval('火锅', '重庆老火锅 潮汕牛肉', ['牛油', '吊龙']);
    await testRetrieval('奶茶饮品', '喜茶多肉葡萄 瑞幸生椰', ['多肉葡萄', '生椰']);
    await testRetrieval('水果', '丹东草莓 海南芒果', ['丹东', '金煌芒']);

    console.log('\n========== 行业场景（母婴/3C/美护/服装/生鲜） ==========');
    await testRetrieval('母婴', '奶粉 水解蛋白 尺码', ['水解蛋白', 'NB', 'S码']);
    await testRetrieval('3C数码', 'i7 处理器 RAM 存储', ['RAM', 'i7', '8代']);
    await testRetrieval('美妆', '护肤品 抗老 敏感肌', ['抗老', 'A醇', '敏感肌']);
    await testRetrieval('服装', '尺码 面料 聚酯纤维', ['尺码', '面料', '聚酯']);
    await testRetrieval('生鲜', '海鲜 冷链 水果分级', ['冷链', 'GB/T', '水果']);

    console.log('\n========== 商家端场景 ==========');
    await testRetrieval('新品推广', '新品上市 阶梯推广 转化率', ['新品', '转化率', 'DSR']);
    await testRetrieval('活动设计', '满减 门槛 优惠券叠加', ['满减', '门槛', '价格倒挂']);
    await testRetrieval('社群运营', '私域 KOC 互动话题', ['KOC', '私域', '互动话题']);

    console.log('\n========== Agent 边界场景 ==========');
    await testRetrieval('多语言', '跨境 多语言 订单确认', ['多语言', 'Lazada', '跨境']);
    await testRetrieval('语音交互', '语音 口述 意图解析', ['语音', 'Whisper', '意图']);
    await testRetrieval('退款上限', '退款 上限 人工审核', ['5000', '10000', '兜底']);
    await testRetrieval('隐私保护', 'GDPR 隐私 个保法', ['GDPR', '个保法', '合规']);
    await testRetrieval('多轮对话', '多轮上下文 Chain', ['多轮', 'LangChain', '上下文']);
    await testRetrieval('Agent 降级', '降级 友好错误 不可用', ['降级', '商家系统繁忙']);
    await testRetrieval('多 Agent 互操作', 'Multi Agent 互操作 Anthropic', ['互操作', 'Anthropic']);

    console.log('\n' + '=' .repeat(60));
    console.log(`[PASS] ${passed}, [FAIL] ${failed}, 总计 ${passed+failed}, 通过率 ${((passed/(passed+failed))*100).toFixed(1)}%`);
    console.log('=' .repeat(60));

    if (passed === failed + passed) {
        console.log('\n[OK] 全部场景覆盖：');
        console.log('   [1] 5 大痛点核心证据');
        console.log('   [2] 30+ 真实菜品 8 大菜系');
        console.log('   [3] 5 大行业场景');
        console.log('   [4] 商家端 3 大场景');
        console.log('   [5] Agent 7 个边界场景');
    }
}

main().catch(console.error);
