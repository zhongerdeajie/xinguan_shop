# 星选 AI 购物管家 — 架构设计

## 项目定位

**面向 C 端消费者的 AI 购物管家**，由多 Agent 协同驱动，解决电商场景中 5 大真实用户痛点。

## 针对的 5 大真实痛点

| 痛点来源 | 痛点描述 | 本项目方案 |
|---|---|---|
| 用户林晓（95 后运营） | "AI 推荐被 GEO 推广污染，不中立" | 中立推荐过滤：标记广告商品 + 中立权重 |
| 运营陈明（电商总监） | "AI 生成的详情页卖点是套话" | 商家文案 Agent：基于真实用户评价生成 |
| 用户大麦（咖啡爱好者） | "AI 关键词污染，匹配能力差" | 自然语言下单 Agent：精确语义理解 + 多条件过滤 |
| 商家林芷（淘宝店主） | "AI 选品是黑箱，不知道怎么优化" | 营销 Agent：透明规则 + 转化率统计 |
| 所有消费者 | "满减烧脑、比价麻烦、售后慢、假打折" | 凑单 Agent + 比价 Agent + 售后 Agent + 历史价格 |

## 技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| 高并发服务 | Go + Gin + GORM | 订单 / 库存 / 秒杀 |
| AI Agent | Python + LangGraph | 6 个专项 Agent + Orchestrator |
| RAG | LangChain + SimpleVectorStore | 商品知识库 + 用户评价 |
| 缓存 | Redis 7 | 库存 / 历史价格 / 会话 |
| 数据库 | MySQL 8.0 | 主数据 |
| 后端 API | NestJS + TypeScript + Prisma | CRUD + 业务编排 |
| BFF | Next.js + TypeScript | 用户端 H5 |
| 用户端 | Vue 3 + TypeScript | 商家管理后台 |

## 微服务划分

| 服务 | 端口 | 语言 | 职责 |
|---|---|---|---|
| vue-admin | 5173 | TS/Vue | 商家管理后台 |
| next-web | 3001 | TS/Next | 用户端 H5 |
| nestjs-api | 3000 | TS/Nest | 业务编排 + CRUD |
| python-ai | 5000 | Py/LangGraph | 6 个 Agent + Orchestrator |
| go-service | 8081 | Go/Gin | 订单 / 库存 / 支付 / 秒杀 |
| redis | 6379 | - | 库存 / 历史价格 / 会话 |
| mysql | 3307→3306 | - | 主数据 |

## 多 Agent 架构

### Orchestrator（意图识别 + 路由）
```
用户输入 → 意图分类 → 路由到对应 Agent
├─ 下单意图 → nl_order_agent
├─ 凑单意图 → smart_bargain_agent
├─ 比价意图 → price_compare_agent
├─ 售后意图 → aftersales_agent
└─ 营销意图（商家端）→ marketing_agent
```

### 6 个 Agent 的工具数

| Agent | 工具数 | 核心能力 |
|---|---|---|
| nl_order_agent | 12 | 自然语言下单 + 凑单 + 推荐 |
| smart_bargain_agent | 8 | 规则过滤 + 状态压缩 DP |
| price_compare_agent | 10 | 跨品类比价 + 历史价格曲线 |
| aftersales_agent | 9 | 问题识别 + 自动退款 + 通知 |
| marketing_agent | 11 | 用户分群 + 文案生成 + 推送 |
| recommender_agent | 7 | 中立推荐 + GEO 标记 |

## 数据流

```
用户 (H5/小程序)
  ↓ 自然语言
Next.js BFF (3001)
  ↓ 转发
NestJS API (3000)
  ↓ 调用
Python AI Agent (5000)
  ↓ Orchestrator 路由 → Agent 推理
  ↓ 调用工具
Go Service (8081) ←→ MySQL / Redis
  ↓ 返回结果
NestJS API 聚合
  ↓ 响应
Next.js BFF
  ↓ 渲染
用户
```

## 关键设计

### 1. 中立推荐（针对痛点 1）
- 商品表加 `is_sponsored` 字段
- 推荐时标记 Sponsored，不参与中立权重
- 用户可一键关闭"赞助内容"

### 2. 商家文案（针对痛点 2）
- 文案生成基于真实用户评价 RAG
- 禁止模板化套话
- 自动标注信息来源（哪条评价）

### 3. 自然语言下单（针对痛点 3）
- LLM 严格解析多条件（人数/预算/时间/口味）
- 多步工具调用避免关键词污染
- 调用 SimpleVectorStore 精确语义检索

### 4. 营销透明（针对痛点 4）
- 推送规则可解释（"为什么推给我"）
- 商家可看自己被推荐的场景
- GEO 优化从"玄学"变成"数据"

### 5. 用户痛点全覆盖（针对痛点 5）
- 凑单 DP 算法 80ms 内最优解
- 历史价格 Redis Sorted Set 追踪 90 天
- 售后 Agent 自动识别少送漏送
- 跨平台比价 + 真打折识别