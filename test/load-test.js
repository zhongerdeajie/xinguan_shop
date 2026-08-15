const http = require('http');

function get(path, port = 8081) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        http.get({ hostname: 'localhost', port, path }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: body, time: Date.now() - start }));
        }).on('error', (e) => resolve({ status: 0, error: e.message, time: Date.now() - start }));
    });
}

async function concurrencyTest(path, concurrency, port = 8081) {
    const start = Date.now();
    const promises = Array.from({ length: concurrency }, () => get(path, port));
    const results = await Promise.all(promises);
    const totalTime = Date.now() - start;
    
    const success = results.filter(r => r.status === 200).length;
    const fail = results.filter(r => r.status !== 200).length;
    const times = results.map(r => r.time).sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const p99 = times[Math.floor(times.length * 0.99)];
    
    return { success, fail, totalTime, avg, p50, p95, p99 };
}

async function main() {
    console.log('=== 星选 AI 购物管家 - 高并发压力测试 ===\n');
    
    // 测试 Go 服务
    console.log('【Go 服务 - 菜品查询】');
    
    // 10 并发
    let r = await concurrencyTest('/api/v1/dishes?limit=10', 10);
    console.log(`  10 并发: ${r.success}/${r.success + r.fail} 成功, 总耗时 ${r.totalTime}ms, 平均 ${r.avg.toFixed(0)}ms, P95 ${r.p95}ms`);
    
    // 50 并发
    r = await concurrencyTest('/api/v1/dishes?limit=10', 50);
    console.log(`  50 并发: ${r.success}/${r.success + r.fail} 成功, 总耗时 ${r.totalTime}ms, 平均 ${r.avg.toFixed(0)}ms, P95 ${r.p95}ms`);
    
    // 100 并发
    r = await concurrencyTest('/api/v1/dishes?limit=10', 100);
    console.log(`  100 并发: ${r.success}/${r.success + r.fail} 成功, 总耗时 ${r.totalTime}ms, 平均 ${r.avg.toFixed(0)}ms, P95 ${r.p95}ms`);
    
    // 测试 NestJS 服务
    console.log('\n【NestJS 服务 - 用户查询】');
    r = await concurrencyTest('/v1/orders?page=1&pageSize=10', 10, 3000);
    console.log(`  10 并发: ${r.success}/${r.success + r.fail} 成功, 总耗时 ${r.totalTime}ms, 平均 ${r.avg.toFixed(0)}ms, P95 ${r.p95}ms`);
    
    r = await concurrencyTest('/v1/orders?page=1&pageSize=10', 50, 3000);
    console.log(`  50 并发: ${r.success}/${r.success + r.fail} 成功, 总耗时 ${r.totalTime}ms, 平均 ${r.avg.toFixed(0)}ms, P95 ${r.p95}ms`);
    
    // 测试 Python AI 服务
    console.log('\n【Python AI 服务 - 健康检查】');
    r = await concurrencyTest('/health', 10, 5000);
    console.log(`  10 并发: ${r.success}/${r.success + r.fail} 成功, 总耗时 ${r.totalTime}ms, 平均 ${r.avg.toFixed(0)}ms`);
    
    r = await concurrencyTest('/health', 50, 5000);
    console.log(`  50 并发: ${r.success}/${r.success + r.fail} 成功, 总耗时 ${r.totalTime}ms, 平均 ${r.avg.toFixed(0)}ms`);
    
    console.log('\n=== 压力测试完成 ===');
}

main().catch(console.error);
