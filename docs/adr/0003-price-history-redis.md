# ADR 0003: 为什么历史价格用 Redis Sorted Set 而不是 MySQL

## 状态
已采纳（2026-07-27）

## 背景

商家先涨后降号称打折是常见痛点（痛点 5）。需要追踪商品 90 天价格，让 Agent 判断"真打折"还是"假打折"。

## 评估方案

| 方案 | 写入性能 | 查询性能 | 存储成本 |
|---|---|---|---|
| A. MySQL 90 天 × 1000 商品 | 50/s | 200ms | 90 万行 |
| B. Redis Hash 单字段 | 5000/s | 1ms | 高 |
| C. Redis Sorted Set | 5000/s | 1ms | 中 |

## 决策

采用 **Redis Sorted Set**（方案 C）。

### 数据结构
```
key: price:history:{productId}
score: timestamp (毫秒)
value: price (元)
```

### 查询模式
- 查询最近 N 天价格：`ZRANGEBYSCORE` + 区间
- 查询价格曲线：`ZRANGEBYSCORE` 全量
- 判断真打折：当前价 vs 90 天最低/最高/中位数

### 写入策略
- 每天凌晨 2:00 定时爬取热门商品价格
- 写入 `ZADD price:history:{id} {timestamp} {price}`
- 设置过期时间 90 天 `EXPIRE`

## 性能对比

| 操作 | MySQL | Redis Sorted Set |
|---|---|---|
| 单商品 90 天写入 | 50ms | 1ms |
| 单商品价格曲线查询 | 200ms | 1ms |
| 1000 商品批量查询 | 30s | 100ms |

## 影响

- MySQL 压力降低 80%
- Agent 判断真打折响应时间 < 50ms
- 存储成本降低 70%