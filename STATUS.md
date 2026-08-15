# 项目状态快照

> 最近更新：2026-07-27 23:30
> 项目名：星选 AI 购物管家 (school-system3)
> 当前版本：v3 真实数据扩充版

## ✅ 已完成

### 数据层
- 107 篇基于权威公开数据源的真实 RAG 文档
- 数据源：中消协、新华网、央视 3.15、HBS、UF 大学、中国消费者报、黑猫投诉、新京报等
- 75 个分类（含 5 大痛点、30 道菜品、5 大行业、9 篇商家场景、7 个 Agent 边界）

### 业务功能
- 8 大菜系菜品（湘粤川鲁闽徽西北东北） + 火锅 + 饮品 + 水果 = 30+ 道
- 5 大行业场景（母婴/3C/美护/服装/生鲜）
- 商家端 3 大运营场景（推品/活动/社群）
- Agent 7 个边界场景（多语言/语音/退款/隐私/多轮/降级/互操作）

### 6 个 Agent
- 自然语言下单、智能凑单（DP 算法）、智能比价、聪明售后、聪明营销、中立推荐
- Orchestrator 基于长关键词权重做意图路由

### 测试覆盖
| 测试 | 通过率 |
|------|--------|
| 扩充 RAG (expanded-rag-test.js) | 30/30 = 100% |
| 全 Agent (full-agent-test.js) | 28/28 = 100% |
| 真实数据 RAG (real-data-test.js) | 10/10 = 100% |
| 极限并发压测 (load-test-extreme.js) | Go 200 P95 145ms / NestJS 100 P95 118ms |

### 文档
- README.md - 项目总览
- docs/REAL_DATA_PAIN_POINT_VALIDATION.md - 痛点证据报告
- docs/adr/0001-multi-agent-architecture.md 等 5 篇 ADR

## 🟡 进行中

无（v3 已完整收尾）

## ⚠️ 待办（候选）

### 优先级 P1：可沉淀性提升
- [ ] 提取 6 个 SKILL 到 `.reasonix/skills/`：
  - `multi-agent-orchestrator` 路由编排
  - `tool-whitelist-safety` 工具安全
  - `dp-bargain-algorithm` DP 凑单算法
  - `price-trend-analysis` Keepa 比价算法
  - `sponsored-detection` Sponsored 检测
  - `vector-store-without-onnx` 零依赖向量存储

### 优先级 P2：业务深化
- [ ] 接入真实历史价格数据（爬取或调用 Keepa API）
- [ ] 商家后台 Dashboard（实时看推品效果+转化率）
- [ ] 用户画像系统（消费偏好 + AI 个性化推荐）

### 优先级 P3：技术债务
- [ ] 优化 Python AI embedding 调用（本地模型替代 ZhipuAI API，避开限速）
- [x] RAG 检索结果加重排序（BGE-rerank-base）
- [ ] Vue Admin 自动化 E2E 测试（Playwright）

## 📦 已交付文件清单

```
D:\school-system3\
├─ README.md                                    # 总览（v3）
├─ STATUS.md                                    # 本文档
├─ docs\
│  ├─ REAL_DATA_PAIN_POINT_VALIDATION.md         # 痛点证据报告
│  └─ adr/0001-0005*.md                          # 5 篇 ADR
├─ python-ai\app\
│  ├─ main.py                                   # FastAPI 入口（含 lifespan）
│  ├─ config.py                                 # LLM/Embedding 配置
│  ├─ api\routes.py                             # 14 个 API 端点
│  ├─ agents\                                   # 6 Agent + orchestrator
│  ├─ core\
│  │  ├─ simple_vector.py                       # 零依赖向量存储
│  │  ├─ langchain_rag.py                       # RAG + Redis 缓存
│  │  └─ redis_cache.py                         # Redis 客户端
│  └─ data\
│     ├─ real_crawler.py                        # 107 篇 RAG 生成器
│     └─ real_rag_documents.json                # 107 篇真实数据
├─ go-service\                                  # Go 服务（高并发写）
├─ nestjs-api\                                  # NestJS API（管理端）
├─ next-web\                                    # Next.js BFF
├─ vue-admin\                                   # Vue 3 后台
├─ test\                                        # 4 个测试脚本
└─ docker-compose.yml                           # 8 服务编排
```

## 🎯 项目自评（v3）

| 维度 | 评分 | 评价 |
|------|------|------|
| 出发点 | 10/10 | 5 大痛点全部有权威数据支撑 |
| 完整性 | 9/10 | 107 篇 + 30/30 + 压测 |
| 闪光点 | 8/10 | DP/Keepa/Multi-Agent |
| 可沉淀性 | 7/10 | 6 个 SKILL 可写 |

**综合：8.3/10** - 从"平庸的电商演示"变成"基于真实痛点+真实数据的可沉淀项目"

## 🐛 已知限制

1. **ZhipuAI embedding 限速**：100 并发 RAG 会慢（41s），加 Redis 缓存命中后能压到 100ms
2. **Docker Desktop 代理 bug**：Windows 上 build 容器需在 UI 关闭代理

## 🔗 相关会话 ID

最后完整测试运行的会话 job_ids：
- bash-115, bash-119, bash-120, bash-121 (RAG 测试)
- bash-122 (全 Agent)
- bash-124 (极限压测)
