# 星选 AI 购物管家（school-system3）

> 多语言微服务架构：顾客商城 + 管理后台 + AI 点餐助手
> 顾客端：Next.js 14 ｜ 管理端：Next.js 14（同一套前端，两种身份）
> 后端：NestJS + Go + Python（FastAPI / LangChain / LangGraph）
> 数据：MySQL 8 + Redis 7

本项目是一个用于学习和简历展示的电商 + AI Agent 演示项目。**本文档描述的是项目当前的真实状态**，所有"已实现"功能均可本地复现验证。

---

## 一、功能现状（真实清单）

### ✅ 已实现并可完整演示（真实数据闭环）

| 模块 | 功能 | 数据落点 |
|------|------|----------|
| 顾客账号 | 手机号注册/登录（bcrypt 加密）、我的资料 | MySQL `user` |
| 顾客行为留痕 | 浏览记录、AI 聊天记录自动保存，下次登录可回看 | MySQL `browse_history` / `chat_message` |
| 商城购物 | 浏览菜单、加入购物车、结算、下单、支付 | MySQL `shopping_cart` / `orders` / `order_detail` |
| 售后 | 已支付订单可申请退款（真实退款逻辑，恢复库存） | MySQL `orders`（pay_status=2） |
| 优惠券 | 管理端发券 → 顾客领券 → 购物车选券 → 下单减钱 → 券核销 | MySQL `coupon` / `user_coupon` |
| AI 点餐助手 | 意图路由（6 个 Agent）、中立推荐、真实数据 RAG、**AI 返回可确认的订单建议并真实下单** | MySQL `chat_message` + Go 下单链路 |
| 预算凑单 | 0/1 背包 DP 最优组合，一键加入购物车 | NestJS `POST /api/ai/bargain` |
| 价格历史 | 90 天价格走势（改价自动记录 + 模拟回填），菜品详情折线图，AI 比价 | Redis ZSET `price:history:{id}` |
| 语音输入 | 浏览器原生 Web Speech API（Chrome/Edge，免费） | 前端实时转文字 |
| 多语言 | 首页 / AI 助手页中英切换 | 前端 i18n |
| 管理后台 | 仪表盘（统计 + 7 天订单趋势 + 菜品销量排行）、订单、菜品、分类、套餐、员工、用户、营销中心（优惠券 + AI 文案） | NestJS + MySQL |
| 鉴权 | 管理员 / 顾客双身份 JWT，接口级隔离（顾客 token 进不了后台） | NestJS + Go 共用 JWT_SECRET |
| 隐私保护 | AI 回复自动脱敏手机号 / 身份证号 | Python 路由层 |

### ⚠️ 部分实现（诚实标注）

| 功能 | 真实程度 |
|------|----------|
| 价格历史数值 | 接口/存储/图表真实；90 天历史数值为回填模拟（菜品无公开历史数据源），改价后的记录为真实数据 |
| AI 售后 / 营销 | Agent 会生成话术与文案；真实退款走"我的订单"按钮，AI 侧为聊天演示 |
| 优惠券 | 全链路真实（发券→领→用→核销）；暂未做"分享/赠送/过期"等扩展 |

### ❌ 未实现（规划中）

- 语音上传文件（Whisper API）——当前用浏览器原生语音，无需后端模型
- 多语言后端对话（LLM 可回复英文，但前端仅中英界面）
- 商家端实时经营大屏、库存管理界面
- 顾客收货地址管理界面（注册时自动创建默认地址，结算复用）

---

## 二、系统架构

```text
浏览器
  │
  ▼
Nginx 网关（对外唯一入口，本地 8090 / 生产 80）
  ├─ /          → Next.js 顾客端 + 管理端（3001）
  ├─ /api/*     → NestJS 业务 API（3000，路由带 /v1）
  ├─ /ai/*      → Python AI 服务（5000，映射 /api/v1）
  └─ /go/*      → Go 高并发服务（8081，映射 /api/v1）

数据层：MySQL 8（127.0.0.1:3307，仅本机绑定） + Redis 7（6379）
```

### 服务清单（docker compose 共 7 个容器）

| 服务 | 技术 | 职责 |
|------|------|------|
| nginx | nginx:alpine | 统一网关，动态 DNS 解析上游 |
| next-web | Next.js 14 + React 18 + Tailwind | 顾客端 + 管理端（一套前端，两种身份） |
| nestjs-api | NestJS 10 + Prisma 5 + JWT | 业务 API、顾客/管理员双身份鉴权、凑单、统计、优惠券 |
| go-service | Go + Gin + GORM | 购物车/下单/支付/退款（Redis 库存锁）、价格历史 |
| python-ai | FastAPI + LangChain + LangGraph + 智谱 AI | 6 个 Agent + Orchestrator + RAG + 隐私脱敏 |
| mysql | MySQL 8.0 | 主业务数据库（仅绑 127.0.0.1） |
| redis | Redis 7 | 缓存、库存、价格历史 |

> 说明：原 Vue 管理后台已下线删除，管理功能全部并入 Next.js。

---

## 三、快速开始

### 1. 准备环境变量

复制 `.env.example` 为 `.env` 并填写：

```bash
MYSQL_PASSWORD=你的强密码（仅字母数字）
JWT_SECRET=一长串随机字符
ZHIPU_API_KEY=你的智谱 API Key
NGINX_PORT=8090        # 本地；生产改为 80
AI_SERVICE_USERNAME=admin
AI_SERVICE_PASSWORD=123456
```

### 2. 构建并启动

```bash
docker compose up -d --build
```

首次启动会自动：建表（prisma db push）→ 灌入种子数据（管理员 + 分类 + 菜品）→ 索引 RAG 文档（约 1~2 分钟）。

### 3. 访问入口

| 入口 | 地址（本地） | 账号 |
|------|-------------|------|
| 顾客首页 | http://localhost:8090/ | 免登录 |
| AI 点餐助手 | http://localhost:8090/assistant | 游客可用，登录后自动存档 |
| 顾客登录/注册 | http://localhost:8090/account/login | 手机号 + 密码 |
| 个人中心 | http://localhost:8090/account | 我的订单/浏览/聊天/优惠券 |
| 管理端登录 | http://localhost:8090/login | admin / 123456（种子数据） |
| 接口文档 | http://localhost:8090/api/docs | Swagger |

### 4. 常用命令

```bash
docker compose up -d            # 启动
docker compose down             # 停止
docker compose up -d --build    # 改代码后重建
docker compose logs -f python-ai  # 查看某服务日志
```

---

## 四、安全设计

- 密钥全部在 `.env`（已被 git 忽略），代码中不写死
- MySQL 只绑定 `127.0.0.1`，不对公网暴露
- 管理员 / 顾客双身份 JWT，接口级隔离（实测互相 401）
- 顾客密码与员工密码 bcrypt 哈希存储
- AI 回复自动脱敏手机号 / 身份证号
- Go 下单链路使用 Redis 分布式锁 + 库存扣减，失败自动回滚
- 上线前请更换智谱 API Key、JWT_SECRET 与 MySQL 密码

---

## 五、测试与验证

项目内已做过的关键验证（可复现）：

- 顾客注册 → 领券 → 加购 → 用券下单（60−10=50）→ 支付 → 退款 → 券核销，全链路数据落库
- 双身份鉴权：顾客 token 访问管理接口 401，管理员 token 访问顾客接口 401
- AI 聊天返回结构化订单建议（拍黄瓜 + 辣椒炒肉 = ¥44），一键确认真实下单
- 预算凑单：预算 50 → DP 返回 4 道菜合计 ¥50
- 价格历史：Redis 中每道菜 90 个价格点，接口返回并渲染折线图
- 隐私脱敏：`13800000002` → `138****0002`

---

## 六、简历 / 面试要点

- 多语言微服务：Go / NestJS / Python 三套后端 + 前端双端
- AI Agent：LangGraph 多 Agent 编排 + RAG 真实数据检索 + 意图路由
- 安全工程：双身份 JWT、bcrypt、端口隔离、PII 脱敏、库存一致性
- 电商闭环：账号 → 行为留痕 → 购物 → 订单 → 支付 → 售后 → 优惠券，数据真实落库
- 诚实边界：能清楚说出哪些是真实数据、哪些是模拟回填、哪些是规划中
