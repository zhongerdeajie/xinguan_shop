# 星选AI购物管家 - 深度改造指令(给服务器端Agent)

> 这份文档只给核心思路和核心代码骨架,你可以也应该根据自己的理解进行拓展、优化和发挥。
> 执行顺序: 严格按 P0-1 → P0-2 → P0-3 → P1 → P2,有依赖关系。
> 每个问题都包含: 详细问题描述 + 根因分析 + 业界参考方案详解 + 核心代码骨架。

---

## P0-1: AI无多轮对话记忆(必须最先做)

### 问题详解

用户连续对话时,AI完全不记得上一轮说了什么。这是最严重的问题,因为后续的"真下单""退款"都依赖多轮记忆。

**实测现象**:
```
用户: "帮我推荐两个评分最高的菜"
AI:   "推荐: 农家小炒肉4.9分、辣椒炒肉4.8分..."

用户: "选方案1,帮我下单"
AI:   "我理解您的需求: 人数1 预算100... 没找到符合条件的菜"
      ↑ 完全忘了上一轮推荐的菜,把"选方案1"当成全新请求处理

用户: "一共多少钱"
AI:   "未找到 一共 相关商品"
      ↑ 更离谱,连"一共"都被当成搜索关键词
```

### 根因分析

**文件**: `python-ai/app/agents/base.py:77-102`

`run` 方法接收 `session_id` 参数,但**只传给 `_execute`,从不用来存/取历史消息**。数据流是这样的:

```
前端传 session_id
  → routes.py 的 chat 接口收到
  → 传给 orchestrator.route(session_id=...)
  → 传给 agent.run(session_id=...)
  → 传给 agent._execute(session_id=...)
  → _execute 根本没用它
```

`session_id` 穿透了4层调用,但没有任何一层把它用来存/取历史。每次请求都是无状态的。

**项目里已有的雏形**: `python-ai/app/agents/langgraph_agent.py:102` 用了 `MemorySaver`(LangGraph的内存版checkpoint),但:① 不在主链路;② 内存版重启即丢。

### 业界参考方案详解: LangGraph Checkpointer + Redis

**参考项目**: `redis-developer/langgraph-redis`(Redis官方维护,Star 500+)

**核心思路**: LangGraph的 `compile(checkpointer=...)` 机制能在Agent执行的每一步(super-step)自动把状态存到Redis。下次同一 `thread_id` 进来时,自动加载历史状态。这比手动存历史消息更优雅,因为:
1. 不只存消息,还存Agent内部状态(如已选的方案、已查的菜品);
2. 支持分支(用户可以从第3轮重新开始走不同路径);
3. Redis持久化,容器重启不丢。

**但你的项目不需要一步到位上LangGraph重写**。更务实的做法:用Redis List手动存历史消息,简单直接,改完就能用。LangGraph Checkpointer是长期演进方向。

**Redis List存历史的核心思路**:
- Key: `chat:history:{session_id}`
- Value: JSON数组 `[{"user":"...", "assistant":"..."}, ...]`
- 用 `LPUSH` 新增(最新的在前)、`LRANGE` 读最近N轮、`LTRIM` 保留最多20轮、`EXPIRE` 24小时过期
- 为什么用List不用Hash: List天然有序,LPUSH+LRANGE就是"最近N条消息"

### 核心代码骨架(可自行拓展)

**改 `python-ai/app/agents/base.py`**:

```python
# 顶部新增Redis连接
import json, redis, os
_redis = None
def get_redis():
    global _redis
    if _redis is None:
        _redis = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    return _redis

# run方法改造: 加载历史 → 执行 → 保存历史
async def run(self, message, user_id="anonymous", session_id="default", entities=None):
    entities = entities or {}
    self.tools_used = []
    history = self._load_history(session_id)  # 新增
    result = await self._execute(message, user_id, session_id, entities, history=history)  # 传history
    self._save_history(session_id, message, result)  # 新增
    return {"response": result, "tools_used": self.tools_used, "error": False}

# 两个辅助方法
def _load_history(self, session_id, max_turns=10):
    # 从Redis读 chat:history:{session_id},返回 [{"role":"user","content":"..."},...] 格式
    # 你可以拓展: 支持按user_id隔离、支持加载Agent内部状态
    pass

def _save_history(self, session_id, user_msg, assistant_msg):
    # LPUSH到Redis,EXPIRE 24h,LTRIM保留20轮
    # 你可以拓展: 存更多元数据(intent/tools_used/时间戳)、支持历史搜索
    pass
```

**所有Agent子类的 `_execute` 加 `history` 参数**:
```python
async def _execute(self, message, user_id, session_id, entities, history=None):
    history = history or []
    # 你可以拓展: 把history[-6:]拼进system prompt传给LLM
    # 或用history做上下文感知(如检测用户是否在确认上一轮的方案)
```

### 验证方法
同session_id发"推荐菜"→"选方案1"→"确认",AI应记得上一轮推荐了什么。

---

## P0-2: AI不能真下单

### 问题详解

用户说"我要下单一份拍黄瓜",系统的表现自相矛盾:
- `order_suggestion` 字段正确返回了拍黄瓜12元 ✅
- 但 `tools_used: []` —— **没调用任何工具** 🔴
- AI回复:"没找到符合条件的菜" 🔴

**为什么order_suggestion有数据但tools_used是空的?** 因为这是两个独立的东西:
- `order_suggestion` 是 `routes.py:23` 的 `build_order_suggestion` 在Agent执行**完后**,扫描消息里的菜品名生成的(纯字符串匹配,不调任何API);
- `tools_used` 是Agent内部真正调用的工具记录,空列表说明Agent什么都没干。

**根因**: `nl_order_agent.py:59-130` 的 `_execute` 方法只做查询+生成方案,从头到尾没调 `create_order`。它声明了5个工具(search_dishes/get_user_preferences/check_inventory/add_to_cart/create_order),但一个都没真调。

### 业界参考方案详解: ReAct模式 + Function Calling

**参考项目**: Dify Agent节点(`docs.dify.ai/zh/learn/tutorials/workflow-101/lesson-08`)、Claude Code的tool_use范式、LangChain ReAct(`python.langchain.com/docs/modules/agents/agent_types/react`)

**ReAct(Reasoning + Acting)核心思路**: 让LLM在"思考"和"行动"之间交替循环:
1. LLM思考下一步该做什么(基于用户消息+历史+工具列表);
2. LLM输出tool_call(调哪个工具+参数);
3. 框架执行工具,把结果回灌给LLM;
4. LLM根据结果继续思考;
5. 直到LLM认为任务完成,输出最终回复。

**Dify的做法**: 不搞意图分类层,LLM直接读所有工具的description,用Function Calling自主决定调哪个。工具调错了能自己纠偏(反馈闭环)。

**你的项目该怎么借鉴**: 你的模型是智谱GLM(不算强),完全照搬Dify的"无分类层"可能不准。但可以借鉴ReAct的"思考-行动-观察"循环,在 `_execute` 里实现一个简化版:
1. 先判断用户是否在确认下单(检测历史+确认词);
2. 如果是,从历史里取出上一轮方案,真调下单API;
3. 如果不是,查菜品→展示方案→询问确认。

### 核心代码骨架(可自行拓展)

**改 `python-ai/app/agents/nl_order_agent.py`**:

```python
async def _execute(self, message, user_id, session_id, entities, history=None):
    history = history or []
    
    # 1. 确认下单场景(用户说"确认""下单""好的")
    if self._is_confirmation(message) and history:
        order = self._extract_pending_order(history)  # 从历史解析待下单方案
        if order:
            result = await call_nestjs_api("/v1/orders", method="POST", data={
                "addressBookId": 1, "payMethod": 1, "dishes": order["items"]
            })
            if result["status"] == 201:
                self.record_tool_usage("create_order")
                return f"✅ 下单成功!订单号: {result['data'].get('number')}"
    
    # 2. 新下单场景(用户说"我要一份拍黄瓜")
    dish_names = self._extract_dishes(message)  # 正则提取菜名
    if dish_names:
        # 查菜品是否存在
        # 展示方案+询问确认
        # 你可以拓展: 多菜组合、预算检查、库存检查、用户偏好过滤
        pass
    
    # 3. 原有多菜组合逻辑保留

def _is_confirmation(self, message):
    # 检测"确认/下单/好的/可以/确定"等词
    # 你可以拓展: 更精细的意图判断、支持"取消"等否定词
    pass

def _extract_pending_order(self, history):
    # 从历史里解析上一轮推荐的菜品和数量
    # 你可以拓展: 用LLM解析(比正则准)、存结构化的pending_order到Redis
    pass

def _extract_dishes(self, message):
    # 正则匹配"一份拍黄瓜""两个辣椒炒肉"等
    # 你可以拓展: 用LLM做NER实体抽取、支持"辣的""便宜的"等模糊描述
    pass
```

**关键注意**: `call_nestjs_api` 直接连 `nestjs-api:3000`,路径用 `/v1/xxx`(NestJS内部前缀,不走nginx的`/api/`重写)。

### 验证方法
发"我要一份拍黄瓜"→AI回复"确认下单吗"→发"确认"→AI回复"下单成功,订单号xxx"。

---

## P0-3: go-service业务路由全空

### 问题详解

Go服务只实现了 `/health` 健康检查,业务路由全404:
- `/go/api/v1/dishes` → 404
- `/go/api/v1/users` → 404
- `/go/api/v1/orders` → 404

导致 `nl_order_agent.py` 调 `call_go_service("/api/v1/dishes")` 时拿不到数据。

### 根因分析

`go-service/` 目录下有 `handler.go`、`user/handler.go` 等文件,但路由注册不完整——只有 `/api/v1/health` 被注册到Gin路由表。业务handler存在但没挂到路由上。

### 业界参考方案详解

**方案A(推荐)**: 不改Go,python-ai直接调NestJS。NestJS已有完整的 `/api/dishes` `/api/orders` CRUD,重写Go路由是浪费时间。Go服务保留做未来的高并发场景(如订单状态流转、秒杀)。

**方案B(长期)**: 实现Go路由。参考Gin官方文档 `gin-gonic.com/docs`。但如果Go没有明确的性能优势场景,不建议现在投入。

### 核心代码骨架

**改 `python-ai/app/agents/nl_order_agent.py`**:
```python
# 所有 call_go_service(f"/api/v1/dishes?...") 改成:
r = await call_nestjs_api(f"/v1/dishes?categoryType=1&maxPrice={budget}&limit=8")
```

路径从 `/api/v1/xxx` 改成 `/v1/xxx`。

**你可以拓展**: 如果未来Go实现了高性能查询(如Redis缓存菜品),可以加一个fallback逻辑:先调Go,404再调NestJS。

---

## P1-1: 向量索引500 + 向量库内存版

### 问题详解

两个问题叠加:
1. **`/ai/index` 接口500**: 无法新增向量数据(可能upsert有bug或embedding调用失败);
2. **`SimpleVectorStore` 是内存版**: 容器重启后所有向量数据丢失。

实测: 搜"辣椒炒肉好吃吗"能返回3条(score 0.81-0.89),说明**已有数据能检索**,但无法新增+重启即丢。

### 根因分析

`python-ai/app/core/simple_vector.py` 的 `SimpleVectorStore` 把向量存在Python进程内存里(`self.vectors`列表)。进程结束数据就没了。`/ai/index` 的500需要看服务器日志定位,但即使修了500,重启还是会丢。

### 业界参考方案详解: Qdrant(轻量向量数据库)

**参考项目**: `qdrant/qdrant`(GitHub Star 20k+),文档 `qdrant.tech/documentation`

**为什么选Qdrant而不是Milvus**:
- Qdrant: 单容器,内存50-100MB,适合2G服务器;
- Milvus: 多容器(etcd+minio+milvus),内存1G+,2G服务器扛不住;
- Chroma: 轻量但功能弱,不适合生产;
- 你项目已有 `docker-compose.milvus.yml` 但不建议用(Milvus太重)。

**Qdrant核心思路**: 独立向量数据库容器,HTTP API,数据持久化到磁盘volume。Python SDK `qdrant-client` 调用,接口和 `SimpleVectorStore` 几乎一样(upsert/search),替换成本低。

**向量库选型对比表**(来自 `blog.csdn.net/Trb701012/article/details/159081635`):
| 维度 | Qdrant | Milvus | Chroma | FAISS |
|---|---|---|---|---|
| 内存占用 | 低 | 高 | 低 | 最低 |
| 持久化 | 磁盘 | 磁盘 | 磁盘 | 无 |
| Docker友好 | 单容器 | 多容器 | 单容器 | 需自己封装 |
| 适合2G服务器 | ✅ | ❌ | ✅ | ✅ |

### 核心代码骨架(可自行拓展)

**docker-compose.yml 加**:
```yaml
qdrant:
  image: qdrant/qdrant:latest
  ports: ["6333:6333"]
  volumes: [qdrant_data:/qdrant/storage]
  networks: [xinguan-net]
volumes:
  qdrant_data:
```

**新建 `python-ai/app/core/qdrant_vector.py`**:
```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter

class QdrantVectorStore:
    def __init__(self):
        self.client = QdrantClient(url=os.getenv("QDRANT_URL", "http://qdrant:6333"))
        # 确保 collection 存在(1536维=MiniMax embo-01)
    
    async def upsert(self, vectors):
        # 把 [{"doc_id":1,"embedding":[...],"entity_type":"dish","content":"..."}] 写入Qdrant
        # 你可以拓展: 批量写入、upsert去重、payload索引
        pass
    
    def search(self, query_vector, top_k=5, entity_type=None):
        # 用Qdrant search接口,支持entity_type过滤
        # 你可以拓展: 混合检索(向量+标量过滤)、分页、score阈值
        pass
```

**改 `app/main.py`**: 用 `QdrantVectorStore` 替换 `SimpleVectorStore`。

**你可以拓展**: `langchain_rag.py` 的 `_retrieve` 和 `search` 方法也要适配——原来传query字符串给 `vector_store.search()`,现在需要先embedding再传vector。可以加一个适配层保持接口不变。

---

## P1-2: 比价是假数据

### 问题详解

用户问"辣椒炒肉是不是假打折",AI返回的价格曲线是**随机生成的**。

**根因**: `price_compare_agent.py:234` 的 `_get_mock_history` 方法,用 `random.uniform(0.8, 1.2)` 生成30天假价格。注释都写了"生成模拟历史价格"。

### 业界参考方案详解: Redis ZSET存真实价格历史

**核心思路**: Redis的Sorted Set(ZSET)天然适合存时间序列数据——用时间戳做score,价格做member。

```
ZADD price:history:{dishId} {timestamp1} {price1}
ZADD price:history:{dishId} {timestamp2} {price2}
ZRANGE price:history:{dishId} 0 -1 WITHSCORES  # 取全部历史
ZREMRANGEBYSCORE price:history:{dishId} 0 {cutoff}  # 清理90天前的
```

**为什么用ZSET**:
- 自动按时间戳排序;
- `ZRANGE` 取范围就是取时间段;
- `ZSCORE` 取某个时间点的价格;
- 内存占用极低(每条记录几十字节)。

**参考文档**: Redis官方ZSET文档 `redis.io/docs/data-types/sorted-sets/`

### 核心代码骨架(可自行拓展)

**NestJS侧 - 菜品价格变动时写Redis** (`nestjs-api/src/dishes/dishes.service.ts`):
```typescript
async update(id, updateDishDto) {
  const old = await this.prisma.dish.findUnique({ where: { id } });
  const updated = await this.prisma.dish.update({ where: { id }, data: updateDishDto });
  if (updateDishDto.price && String(updateDishDto.price) !== String(old?.price)) {
    const ts = Date.now();
    await this.redis.zadd(`price:history:${id}`, ts, String(updateDishDto.price));
    await this.redis.zremrangebyscore(`price:history:${id}`, 0, ts - 90*86400*1000);
  }
  return updated;
}
```

**Python侧 - 读真实历史** (`price_compare_agent.py`):
```python
def _get_real_history(self, product_id):
    # 从Redis ZRANGE读 price:history:{product_id}
    # 没有历史时返回空列表(不要造假!)
    # 你可以拓展: 缓存历史到内存、支持自定义时间范围、价格变动告警
    pass
```

**你可以拓展**: 在 `_execute` 里,没有历史数据时返回"暂无历史数据",而不是造假。趋势分析可以更丰富:计算7天/30天均价、涨跌幅、波动率。

---

## P1-3: 售后不退款

### 问题详解

用户说"少送了一个菜,要退款",AI只回复"请描述您遇到的问题",**不调退款API**。

**根因**: `aftersales_agent.py` 只做意图引导,没有调 `PUT /api/orders/:id/cancel` 接口(这个接口之前测过返回200,是好的)。

### 业界参考方案详解

你的NestJS已有 `PUT /api/orders/:id/cancel` 接口,让Agent在用户确认后真调这个接口。和多轮记忆配合:用户说"取消订单123"→AI确认→用户说"确认退款"→AI调cancel API。

### 核心代码骨架(可自行拓展)

**改 `python-ai/app/agents/aftersales_agent.py`**:
```python
async def _execute(self, message, user_id, session_id, entities, history=None):
    history = history or []
    
    # 1. 确认退款(用户说"确认退款")
    if self._is_cancel_confirmation(message) and history:
        order_id = self._extract_order_id_from_history(history)
        if order_id:
            r = await call_nestjs_api(f"/v1/orders/{order_id}/cancel", method="PUT", data={"reason":"用户申请退款"})
            if r["status"] == 200:
                self.record_tool_usage("cancel_order")
                return f"✅ 订单{order_id}已取消,退款1-3工作日到账"
    
    # 2. 提取订单号(用户说"取消订单123")
    order_id = self._extract_order_id(message)
    if order_id:
        return f"找到订单{order_id},确认取消退款吗?回复'确认退款'"
    
    # 3. 原有引导逻辑
    # 你可以拓展: 支持部分退款、换货、投诉工单、转人工客服
```

---

## P2-1: 缓存形同虚设

### 问题详解

同一问题问两次,第二次不比第一次快。原因:
- `LangChainRAG` 的Redis缓存只对**MD5完全匹配**的query生效("推荐菜"和"推荐个菜"是两个不同key);
- `chat` 接口每次都走完整Agent链路,根本不经过RAG缓存。

### 业界参考方案详解: 语义缓存(Semantic Cache)

**参考项目**: GPTCache(`github.com/zilliztech/GPTCache`,Star 2k+)、Redis VL(`redis.io/docs/latest/develop/use-cases/semantic-caching/`)

**核心思路**: 不比较query文本是否相同,而是比较 **query的embedding是否相似**。相似度 > 阈值 → 直接返回缓存的答案。

```
用户: "推荐评分最高的菜"  → 缓存(embedding + response)
用户: "评分最高的菜有哪些" → embedding相似度0.96 > 0.95 → 命中缓存,秒回!
```

**GPTCache的做法**: 用向量数据库存所有query的embedding,新query进来先embedding再搜相似,命中就返回。支持多种后端(SQLite/Redis/Milvus)。

**简化版做法**(不引入GPTCache): 用Redis存 `{query_embedding, response}`,新query遍历比较相似度。数据量小时够用,量大后换Redis Vector Search或Milvus。

### 核心代码骨架(可自行拓展)

**新建 `python-ai/app/core/semantic_cache.py`**:
```python
async def semantic_get(query, threshold=0.95):
    # 1. 对query做embedding
    # 2. 遍历Redis里所有 sem_cache:* 的key
    # 3. 计算embedding相似度
    # 4. 超过threshold就返回缓存的response
    # 你可以拓展: 用Redis Vector Search替代遍历(性能更好)、支持TTL淘汰
    pass

async def semantic_set(query, response, ttl=3600):
    # 存 {query, embedding, response} 到Redis,设置TTL
    pass
```

**改 `routes.py` 的 chat**: 在 `orchestrator.route` 前加 `semantic_get`,后加 `semantic_set`。

---

## P2-2: 高并发延迟飙升

### 问题详解

20并发AI请求全部成功,但**最慢7秒**(智谱API限流导致队列堆积)。python-ai没有任何限流,高并发时请求堆积→OOM风险。

### 业界参考方案详解: slowapi限流 + uvicorn多进程

**参考项目**: slowapi(`github.com/laurentS/slowapi`,Star 2k+),文档 `slowapi.readthedocs.io`

**核心思路**: 
1. **slowapi**: 基于IP/用户的令牌桶限流,超限返回429+Retry-After。让客户端知道"稍后重试"而不是傻等;
2. **uvicorn多进程**: `--workers 2` 启动2个Python进程,利用2核CPU,单进程GIL不再成为瓶颈。

**令牌桶算法**: 每分钟生成10个令牌,每个请求消耗1个,令牌用完返回429。比固定窗口更平滑(不会在窗口边界突发)。

### 核心代码骨架(可自行拓展)

**`app/main.py` 注册限流器**:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

**`routes.py` chat加装饰器**: `@limiter.limit("10/minute")`

**Dockerfile CMD改**: `--workers 2`

**你可以拓展**: 按用户ID限流(比IP更精确)、不同接口不同限流策略(chat 10/min,search 30/min)、限流后返回建议等待时间。

---

## P2-3: AI意图识别误判

### 问题详解

| 用户输入 | 期望意图 | 实际意图 |
|---|---|---|
| "我要下单辣椒炒肉" | nl_order | price_compare ❌ |
| "商家搞个满减活动" | marketing | smart_bargain ❌ |

### 根因分析

`intent_classifier.py` 只用embedding相似度(单路)。"辣椒炒肉"这个实体词在 `nl_order` 和 `price_compare` 的原型例句里都出现,embedding把实体词权重算得太高,分不清"动作意图"(下单 vs 比价)。

### 业界参考方案详解: 规则快路 + 多特征融合(学Rasa DIET)

**参考项目**: Rasa DIET(`rasa.com/blog/introducing-dual-intent-and-entity-transformer-diet`)、semantic-router(`github.com/aurelio-labs/semantic-router`)

**Rasa DIET的核心思路**: 多特征融合——稠密特征(BERT embedding) + 稀疏特征(CountVectors词n-gram) + 规则(Rule Policy优先级最高) + Fallback(置信度低于阈值走兜底)。

**Rasa的4大设计原则**:
1. **多特征融合**: 稠密(embedding) + 稀疏(词n-gram),稀疏路能捕捉"我要下单"这种强动作短语;
2. **规则优先级最高**: Rule Policy命中规则就跳过ML,100%准确;
3. **Fallback兜底**: 置信度 < 0.3 走兜底(默认0.3,你可以调到0.55更严格);
4. **序列建模**: Transformer捕捉词序(这个你短期难改,暂不学)。

**semantic-router的HybridRouter**: 稠密(dense embedding) + 稀疏(sparse关键词)双路打分,两者都高才采纳。

**你的项目该怎么借鉴**: 
- 短期: 加规则快路(正则匹配强动作词),命中直接返回,不走embedding;
- 中期: 加稀疏特征(CountVectorizer词n-gram),和embedding混合打分;
- 长期: 引入LangGraph重写,或换强模型走Dify路线(无分类层)。

### 核心代码骨架(可自行拓展)

**改 `python-ai/app/core/intent_classifier.py`**:
```python
import re

# 规则快路: 正则匹配强动作词
STRONG_RULES = {
    "nl_order": [r"我要?下单", r"帮我?点(餐|菜)", r"来一份", r"点个", r"订(餐|单)"],
    "marketing": [r"搞?个?活动", r"策划.*促销", r"活动文案", r"满减活动"],
    "aftersales": [r"退款", r"退货", r"投诉", r"少送", r"漏发", r"还没到"],
}

def rule_fast_path(message):
    for intent, patterns in STRONG_RULES.items():
        for p in patterns:
            if re.search(p, message):
                return intent
    return None

# 在 classify 方法最前面加:
async def classify(self, message, role="user"):
    rule = rule_fast_path(message)
    if rule:
        return {"intent": rule, "confidence": 1.0, "method": "rule_fast_path"}
    # 原有embedding逻辑...
    
    # 你可以拓展: 加CountVectorizer稀疏特征、混合打分、Fallback兜底
```

---

## 执行顺序+依赖关系

```
P0-1(多轮记忆) → P0-2(真下单) + P1-3(退款)   [依赖P0-1]
P0-3(go改NestJS)   独立
P1-1(Qdrant)       独立
P1-2(比价Redis)    独立
P2-1(语义缓存)     独立
P2-2(限流)         独立
P2-3(意图规则)     独立
```

## 每步验证方法

| 改造项 | 验证方法 |
|---|---|
| P0-1 | 同session_id发"推荐菜"→"选方案1",AI记得上一轮 |
| P0-2 | 发"下单拍黄瓜"→"确认",真创建订单(查数据库有新订单) |
| P0-3 | Agent不再返回404 |
| P1-1 | 重启python-ai容器后向量数据还在,`/ai/index`不再500 |
| P1-2 | 改菜品价格后,比价能看到真实历史(不是随机数) |
| P1-3 | 发"取消订单123"→"确认退款",订单status变6 |
| P2-1 | "推荐菜"和"推荐个菜"命中同一缓存,第二次秒回 |
| P2-2 | 超过10次/分钟返回429 |
| P2-3 | "我要下单辣椒炒肉"识别为nl_order(不是price_compare) |

---

## 给执行者的说明

这份文档只给**核心思路和核心代码骨架**。你可以也应该根据自己的理解进行拓展、优化和发挥:

1. **代码骨架里的 `pass` 需要你补全**: 我只给了方法签名和关键逻辑,具体实现细节(如正则表达式、Redis操作、错误处理)你可以按自己的理解写;
2. **可以加自己的优化**: 如更好的正则、更完善的错误处理、更丰富的Agent能力、性能优化等;
3. **遇到设计决策可以自己定**: 如history存多少轮、缓存阈值多少、限流多少次/分钟,你根据项目实际情况调整;
4. **如果发现更好的方案**: 如某个问题你发现比文档里更好的解法,可以自行采用,不必拘泥于文档;
5. **改完每个P都要验证**: 按验证方法测试,确认通过再改下一个。
