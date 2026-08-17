# 星选 AI 购物管家 - 深度问题与改造方案手册

> 生成时间: 2026-08-15
> 基于: 全自动浏览器压测(playwright-cli) + 源码审查 + 业界开源方案对照
> 目标: 生产级上线(C 方案,全做)

---

## 目录

- [P0-1: AI 无多轮对话记忆](#p0-1-ai-无多轮对话记忆)
- [P0-2: AI 不能真下单](#p0-2-ai-不能真下单)
- [P0-3: go-service 业务路由全空](#p0-3-go-service-业务路由全空)
- [P1-1: 向量索引 500 + 向量库内存版](#p1-1-向量索引-500--向量库内存版)
- [P1-2: 比价是假数据](#p1-2-比价是假数据)
- [P1-3: 售后不退款](#p1-3-售后不退款)
- [P2-1: 缓存形同虚设](#p2-1-缓存形同虚设)
- [P2-2: 高并发延迟飙升](#p2-2-高并发延迟飙升)
- [P2-3: AI 意图识别误判](#p2-3-ai-意图识别误判)
- [改造路线图](#改造路线图)

---

## P0-1: AI 无多轮对话记忆

### 问题现象

用户连续对话时,AI 完全不记得上一轮说了什么:

```
用户: "帮我推荐两个评分最高的菜"
AI:   "推荐: 农家小炒肉4.9分、辣椒炒肉4.8分..."

用户: "选方案1,帮我下单"
AI:   "我理解您的需求: 人数1 预算100... 没找到符合条件的菜"
      ↑ 完全忘了上一轮推荐的菜

用户: "一共多少钱"
AI:   "未找到 一共 相关商品"
      ↑ 不知道用户在问什么
```

### 根因(源码证据)

**文件**: `python-ai/app/agents/base.py:77-102`

```python
async def run(self, message: str, user_id: str = "anonymous",
              session_id: str = "default",
              entities: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    entities = entities or {}
    self.tools_used = []
    try:
        # 调用子类的具体实现
        result = await self._execute(message, user_id, session_id, entities)
        return {
            "response": result,
            "tools_used": self.tools_used,
            ...
        }
```

`run` 方法接收 `session_id` 但**只传给 `_execute`,从不存历史消息**。每次请求都是全新的,`session_id` 是摆设。

**文件**: `python-ai/app/api/routes.py:104-137`

```python
@router.post("/chat")
async def chat(request: ChatRequest, raw_request: Request, ...):
    orchestrator = get_orchestrator()
    result = await orchestrator.route(
        message=request.message,
        user_id=request.user_id or "anonymous",
        role=request.role,
        session_id=request.session_id  # 传进去了
    )
```

`session_id` 从前端传进来,经过 `routes.py` → `orchestrator.py` → `base.py`,但**没有任何一层把它用来存/取历史消息**。

### 参考方案: LangGraph Checkpointer + Redis

**参考项目**:
- GitHub: `redis-developer/langgraph-redis`(Redis 官方维护)
- 文档: `redis.io/blog/langgraph-redis-build-smarter-ai-agents-with-memory-persistence`
- 博客: `juejin.cn/post/7612826609323704320`(LangGraph 记忆机制中文解析)

**核心机制**:

LangGraph 的 `compile(checkpointer=...)` 在 Agent 执行的每一步(super-step)自动把状态存到 Redis。下次同一 `thread_id` 进来时,自动加载历史状态。

```
用户消息 + thread_id=session_id
  ↓
LangGraph 检查 Redis 有没有这个 thread_id 的历史
  ↓ 有
加载历史 messages + agent state
  ↓
执行 Agent(能看到之前的对话)
  ↓
新状态自动存回 Redis
```

**你的项目已经有雏形**: `python-ai/app/agents/langgraph_agent.py:102` 已经用了 `MemorySaver`(内存版),但:
1. 不在主链路(主链路走 `orchestrator`);
2. `MemorySaver` 是内存版,重启即丢。

### 具体代码改造

**步骤 1: 安装依赖**

```bash
# python-ai/requirements.txt 添加
langgraph-checkpoint-redis>=2.0.0
```

**步骤 2: 创建 Redis Checkpointer**

新文件 `python-ai/app/core/memory.py`:

```python
"""对话记忆管理 - 基于 LangGraph Redis Checkpointer"""
from langgraph.checkpoint.redis import RedisSaver
from langgraph.checkpoint.base import BaseCheckpointSaver
import os
import logging

logger = logging.getLogger(__name__)

_checkpoint_saver: BaseCheckpointSaver = None


def get_checkpoint_saver() -> BaseCheckpointSaver:
    """获取 Redis 持久化的 checkpoint saver(单例)"""
    global _checkpoint_saver
    if _checkpoint_saver is None:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        _checkpoint_saver = RedisSaver.from_conn_string(redis_url)
        logger.info(f"Checkpoint saver initialized with Redis: {redis_url}")
    return _checkpoint_saver
```

**步骤 3: 改造 base.py 的 run 方法**

```python
# base.py 新增历史消息管理
import json
import redis
import os

_redis_client = None

def get_redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    return _redis_client


class BaseAgent(ABC):
    # ... 原有代码 ...

    async def run(self, message: str, user_id: str = "anonymous",
                  session_id: str = "default",
                  entities: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        entities = entities or {}
        self.tools_used = []

        # ===== 新增: 加载历史消息 =====
        history = self._load_history(session_id)
        
        # ===== 新增: 把历史消息 + 当前消息一起传给 _execute =====
        try:
            result = await self._execute(
                message, user_id, session_id, entities,
                history=history  # 新参数
            )
            
            # ===== 新增: 保存本轮对话到历史 =====
            self._save_history(session_id, message, result)
            
            return {
                "response": result,
                "tools_used": self.tools_used,
                "token_used": self.token_used,
                "error": False
            }
        except Exception as e:
            return {
                "response": f"处理出错: {str(e)}",
                "tools_used": self.tools_used,
                "token_used": self.token_used,
                "error": True
            }

    def _load_history(self, session_id: str, max_turns: int = 10) -> List[Dict]:
        """从 Redis 加载历史对话"""
        try:
            r = get_redis()
            key = f"chat:history:{session_id}"
            raw = r.lrange(key, 0, max_turns - 1)
            history = []
            for item in reversed(raw):
                msg = json.loads(item)
                history.append({"role": "user", "content": msg["user"]})
                history.append({"role": "assistant", "content": msg["assistant"]})
            return history
        except Exception as e:
            logger.warning(f"Load history failed: {e}")
            return []

    def _save_history(self, session_id: str, user_msg: str, assistant_msg: str):
        """保存本轮对话到 Redis"""
        try:
            r = get_redis()
            key = f"chat:history:{session_id}"
            entry = json.dumps({"user": user_msg, "assistant": assistant_msg})
            r.lpush(key, entry)
            r.expire(key, 86400)  # 24小时过期
            r.ltrim(key, 0, 19)   # 最多保留20轮
        except Exception as e:
            logger.warning(f"Save history failed: {e}")
```

**步骤 4: 改造 _execute 签名**

所有 Agent 子类的 `_execute` 方法加 `history` 参数:

```python
# nl_order_agent.py
async def _execute(self, message: str, user_id: str,
                   session_id: str, entities: Dict[str, Any],
                   history: List[Dict] = None) -> str:  # 新增
    history = history or []
    
    # 如果有历史,把历史消息拼进 system prompt
    if history:
        history_text = "\n".join([
            f"用户: {m['content']}" if m['role'] == 'user' else f"助手: {m['content'][:200]}"
            for m in history[-6:]  # 最近3轮
        ])
        # 传给 LLM 作为上下文
        ...
```

### 工作量

- 1-2 天(含测试)
- 依赖: Redis(已有)

### 预期效果

```
用户: "帮我推荐两个评分最高的菜"
AI:   "推荐: 农家小炒肉4.9分、辣椒炒肉4.8分..."

用户: "选方案1,帮我下单"
AI:   "好的,帮您下单农家小炒肉1份,35元。确认下单吗?"
      ↑ 记得上一轮推荐的菜

用户: "确认"
AI:   "下单成功,订单号17868xxxxx"
      ↑ 能接上多轮对话
```

---

## P0-2: AI 不能真下单

### 问题现象

用户说"我要下单一份拍黄瓜":
- `order_suggestion` 正确返回了拍黄瓜12元 ✅
- 但 `tools_used: []` —— **没调用任何工具** 🔴
- AI 回复:"没找到符合条件的菜" —— **Agent 内部逻辑跑偏** 🔴

### 根因(源码证据)

**文件**: `python-ai/app/agents/nl_order_agent.py:50-130`

```python
def get_tools(self) -> List[Dict[str, Any]]:
    return [
        {"name": "search_dishes", "description": "按品类/价格/口味搜索菜品"},
        {"name": "get_user_preferences", "description": "获取用户历史偏好"},
        {"name": "check_inventory", "description": "检查菜品库存"},
        {"name": "add_to_cart", "description": "加入购物车"},
        {"name": "create_order", "description": "创建订单(需确认)"},  # 声明了
    ]

async def _execute(self, message, user_id, session_id, entities) -> str:
    # Step 1-4: 查询菜品 + 组合方案
    # ...
    # 从头到尾没调用 create_order!  ← 问题在这
    result += "请告诉我您选哪个方案,或需要我调整。"
    return result
```

**`order_suggestion` 为什么有数据?** 因为 `routes.py:23-66` 的 `build_order_suggestion` 在 Agent 执行完后,扫描消息里的菜品名生成的——不是 Agent 真下的单。

### 参考方案: ReAct 模式 + Function Calling

**参考项目**:
- Dify Agent 节点: `docs.dify.ai/zh/learn/tutorials/workflow-101/lesson-08`
- Claude Code 的 tool_use 范式: LLM 自主决定何时调工具
- LangChain ReAct: `python.langchain.com/docs/modules/agents/agent_types/react`

**核心机制**:

ReAct(Reasoning + Acting)让 LLM 在"思考"和"行动"之间交替:
1. LLM 思考下一步该做什么
2. LLM 输出 tool_call(调哪个工具 + 参数)
3. 框架执行工具,把结果回灌给 LLM
4. LLM 根据结果继续思考
5. 直到 LLM 认为任务完成

```
用户: "我要下单一份拍黄瓜"
  ↓
LLM 思考: 用户要点拍黄瓜,我先查一下有没有这道菜
LLM 输出: search_dishes(name="拍黄瓜")
  ↓
工具执行: 返回 {id:1, name:"拍黄瓜", price:12, stock:50}
  ↓
LLM 思考: 有货,价格12元,直接下单
LLM 输出: create_order(dishId=1, number=1)
  ↓
工具执行: 返回 {orderId:123, status:1}
  ↓
LLM 输出: "下单成功!订单号123,拍黄瓜1份12元"
```

### 具体代码改造

**改造 `nl_order_agent.py` 的 `_execute` 方法**:

```python
async def _execute(self, message: str, user_id: str,
                   session_id: str, entities: Dict[str, Any],
                   history: List[Dict] = None) -> str:
    history = history or []
    
    # Step 1: 检查是否是"确认下单"(多轮场景)
    if self._is_confirmation(message, history):
        # 从历史里取出上一轮的方案
        last_order = self._extract_pending_order(history)
        if last_order:
            # 真调下单接口!
            result = await call_nestjs_api(
                "/api/orders",
                method="POST",
                data={
                    "addressBookId": last_order.get("addressId", 1),
                    "payMethod": 1,
                    "dishes": last_order["items"]
                }
            )
            if result["status"] == 201:
                order = result["data"]
                self.record_tool_usage("create_order")
                return f"✅ 下单成功!\n订单号: {order.get('number')}\n菜品: {last_order['summary']}\n金额: {order.get('amount')}元"
            else:
                return f"下单失败: {result.get('data', {})}"

    # Step 2: 解析用户要什么菜
    dishes_to_order = self._extract_dishes_from_message(message, entities)
    
    if not dishes_to_order:
        return "请问您想点什么菜?可以直接说菜名,比如'我要一份拍黄瓜'"
    
    # Step 3: 查询菜品是否存在
    for dish_name in dishes_to_order:
        r = await call_nestjs_api(f"/api/dishes?keyword={dish_name}")
        if r["status"] == 200:
            dishes = r["data"].get("data", [])
            if dishes:
                dish = dishes[0]
                # Step 4: 询问用户确认
                self.record_tool_usage("search_dishes")
                return (
                    f"为您找到: {dish['name']} - {dish['price']}元\n"
                    f"数量: 1份\n"
                    f"合计: {dish['price']}元\n\n"
                    f"确认下单吗?(回复'确认'即可)"
                )
    
    # Step 5: 多菜组合(原有逻辑保留)
    ...
```

**新增辅助方法**:

```python
def _is_confirmation(self, message: str, history: List[Dict]) -> bool:
    """判断用户是否在确认下单"""
    confirm_words = ["确认", "下单", "好的", "可以", "没问题", "确定"]
    return any(w in message for w in confirm_words) and len(history) > 0

def _extract_pending_order(self, history: List[Dict]) -> Optional[Dict]:
    """从历史里提取待下单的方案"""
    for msg in reversed(history):
        if msg["role"] == "assistant" and "元" in msg["content"]:
            # 解析上一轮推荐的菜品
            return {
                "items": [{"dishId": 1, "number": 1}],
                "summary": msg["content"][:100],
                "addressId": 1
            }
    return None
```

### 工作量

- 1 天(依赖 P0-1 多轮记忆)

---

## P0-3: go-service 业务路由全空

### 问题现象

| 路径 | 结果 |
|---|---|
| `/go/health` | ✅ 200 `{service: go-ecommerce-service, status: ok}` |
| `/go/api/v1/dishes` | 🔴 404 |
| `/go/api/v1/users` | 🔴 404 |
| `/go/api/v1/orders` | 🔴 404 |

`nl_order_agent.py:83` 调 `call_go_service("/api/v1/dishes")` 拿到 404,导致 Agent 内部查不到菜品。

### 根因

Go 服务**只实现了健康检查端点**,业务路由(dishes/users/orders)没有实现。从 `go-service/` 的代码看,有 `handler.go` 和 `user/handler.go` 等文件,但路由注册不完整。

### 参考方案: 两个选择

**方案 A(推荐,省事): 不改 Go,python-ai 直接调 NestJS**

NestJS 已经有完整的 `/api/dishes` `/api/orders` CRUD,不需要重写 Go。

```python
# 把 nl_order_agent.py 里的 call_go_service 改成 call_nestjs_api
# 原来:
r = await call_go_service(f"/api/v1/dishes?categoryType=1&maxPrice={budget}&limit=8")
# 改成:
r = await call_nestjs_api(f"/api/dishes?categoryType=1&maxPrice={budget}&limit=8")
```

**方案 B(长期,如果 Go 有性能价值): 实现 Go 路由**

```go
// go-service/cmd/main.go 补充路由
r.GET("/api/v1/dishes", dishHandler.List)
r.GET("/api/v1/dishes/:id", dishHandler.GetByID)
r.POST("/api/v1/dishes", dishHandler.Create)
// ...
```

参考: Gin 框架官方文档 `gin-gonic.com/docs`

### 推荐: 方案 A

你的 Go 服务当前没有性能优势(NestJS 扛得住),重写 Go 路由是浪费时间。直接让 python-ai 调 NestJS。

### 具体改造

**文件**: `python-ai/app/agents/nl_order_agent.py`

把所有 `call_go_service` 替换为 `call_nestjs_api`:

```python
# 第83行
r = await call_nestjs_api(f"/api/dishes?categoryType=1&maxPrice={budget}&limit=8")
# 第92行
r = await call_nestjs_api(f"/api/dishes?categoryType=2&maxPrice={budget}&limit=8")
# 第101行
r = await call_nestjs_api(f"/api/dishes?categoryType=3&maxPrice={budget}&limit=8")
```

**注意**: NestJS 的 `/api/dishes` 走 nginx 重写为 `/v1/dishes`,但 `call_nestjs_api` 直接连 `nestjs-api:3000`,所以要用 `/v1/dishes`(NestJS 内部前缀)。

### 工作量

- 半天

---

## P1-1: 向量索引 500 + 向量库内存版

### 问题现象

| 测试 | 结果 |
|---|---|
| 搜"辣椒炒肉好吃吗" | ✅ 返回3条,score 0.81-0.89(已有数据能检索) |
| POST `/ai/index` 索引新文档 | 🔴 500 Internal Server Error |
| 容器重启后 | 🔴 向量数据全丢(内存版) |

### 根因

**文件**: `python-ai/app/core/simple_vector.py`

```python
class SimpleVectorStore:
    """简单的内存向量库"""
    # 向量存在 self.vectors(list)里,进程结束即丢
```

`/ai/index` 的 500 可能是 `upsert` 方法有 bug,或 embedding 调用失败。

### 参考方案: Qdrant(轻量向量数据库)

**参考项目**:
- GitHub: `qdrant/qdrant`(20k+ star)
- 文档: `qdrant.tech/documentation`
- 对比: `blog.csdn.net/Trb701012/article/details/159081635`(Milvus/Qdrant/Chroma 选型)

**为什么选 Qdrant 而不是 Milvus**:

| 维度 | Qdrant | Milvus | Chroma |
|---|---|---|---|
| 内存占用 | 低(50-100MB) | 高(1G+) | 低 |
| Docker 友好 | 单容器 | 多容器(etcd+minio) | 单容器 |
| 持久化 | 磁盘 | 磁盘 | 磁盘 |
| 适合 2G 服务器 | ✅ | ❌ | ✅但功能弱 |
| API | HTTP+Python SDK | HTTP+Python SDK | Python SDK |

你的服务器 2G 内存,Milvus 吃 1G+ 不合适,Qdrant 单容器 50-100MB 最合适。

**你已经有 Milvus 配置**: `docker-compose.milvus.yml`,但建议不用。

### 具体改造

**步骤 1: docker-compose.yml 加 Qdrant 容器**

```yaml
# docker-compose.yml services 下新增
qdrant:
  image: qdrant/qdrant:latest
  container_name: qdrant
  restart: unless-stopped
  ports:
    - "6333:6333"  # HTTP API
  volumes:
    - qdrant_data:/qdrant/storage
  networks:
    - xinguan-net

volumes:
  qdrant_data:  # 持久化
```

**步骤 2: 安装 Python SDK**

```bash
# python-ai/requirements.txt
qdrant-client>=1.9.0
```

**步骤 3: 新建 QdrantVectorStore 替换 SimpleVectorStore**

新文件 `python-ai/app/core/qdrant_vector.py`:

```python
"""Qdrant 向量库 - 持久化版"""
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter
from typing import List, Dict, Optional
import os
import logging

logger = logging.getLogger(__name__)

COLLECTION_NAME = "xinguan_vectors"
VECTOR_DIM = 1536  # MiniMax embo-01 维度


class QdrantVectorStore:
    """基于 Qdrant 的持久化向量库"""

    def __init__(self):
        self.client = QdrantClient(
            url=os.getenv("QDRANT_URL", "http://qdrant:6333")
        )
        self._ensure_collection()

    def _ensure_collection(self):
        """确保 collection 存在"""
        collections = self.client.get_collections()
        names = [c.name for c in collections.collections]
        if COLLECTION_NAME not in names:
            self.client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE)
            )
            logger.info(f"Created Qdrant collection: {COLLECTION_NAME}")

    async def upsert(self, vectors: List[Dict]):
        """写入向量"""
        points = [
            PointStruct(
                id=v["doc_id"],
                vector=v["embedding"],
                payload={
                    "entity_type": v["entity_type"],
                    "entity_id": v["entity_id"],
                    "content": v["content"],
                }
            )
            for v in vectors
        ]
        self.client.upsert(collection_name=COLLECTION_NAME, points=points)

    def search(self, query: str, query_vector: List[float],
               top_k: int = 5, entity_type: str = None) -> List[Dict]:
        """搜索向量"""
        query_filter = None
        if entity_type:
            query_filter = Filter(
                must=[{"key": "entity_type", "match": {"value": entity_type}}]
            )

        results = self.client.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_vector,
            limit=top_k,
            query_filter=query_filter
        )

        return [
            {
                "doc_id": r.id,
                "entity_type": r.payload.get("entity_type"),
                "entity_id": r.payload.get("entity_id"),
                "content": r.payload.get("content"),
                "score": r.score
            }
            for r in results
        ]
```

**步骤 4: 替换 app/main.py 的初始化**

```python
# 原: from app.core.simple_vector import SimpleVectorStore
# 改: from app.core.qdrant_vector import QdrantVectorStore

app.state.vector_store = QdrantVectorStore()
```

### 工作量

- 1 天

---

## P1-2: 比价是假数据

### 问题现象

用户问"辣椒炒肉是不是假打折",AI 返回的价格曲线是**随机生成的**。

### 根因(源码证据)

**文件**: `python-ai/app/agents/price_compare_agent.py:234-253`

```python
def _get_mock_history(self, product_id: int, current_price: float) -> List[Dict]:
    """生成模拟历史价格"""  # ← 注释都写了是 mock!
    history = []
    for i in range(30):
        timestamp = int(time.time()) - (30 - i) * 86400
        price = round(current_price * random.uniform(0.8, 1.2), 2)  # 随机!
        history.append({"timestamp": timestamp, "price": price})
    return history
```

### 参考方案: Redis ZSET 存真实价格历史

**核心机制**: Redis 的 Sorted Set(ZSET)天然适合存时间序列数据——用时间戳做 score,价格做 value。

```
ZADD price:history:{dishId} {timestamp1} {price1}
ZADD price:history:{dishId} {timestamp2} {price2}
ZRANGE price:history:{dishId} 0 -1 WITHSCORES  # 取全部历史
```

**参考文档**: Redis 官方 ZSET 文档 `redis.io/docs/data-types/sorted-sets/`

### 具体改造

**步骤 1: NestJS 侧 - 菜品价格变动时写 Redis**

**文件**: `nestjs-api/src/dishes/dishes.service.ts`

```typescript
async update(id: number, updateDishDto: UpdateDishDto) {
  const oldDish = await this.prisma.dish.findUnique({ where: { id } });
  const updated = await this.prisma.dish.update({
    where: { id },
    data: updateDishDto,
  });
  
  // 新增: 价格变动时写 Redis 历史价格
  if (updateDishDto.price && updateDishDto.price !== oldDish?.price) {
    const timestamp = Date.now();
    await this.redis.zadd(
      `price:history:${id}`,
      timestamp,
      String(updateDishDto.price)  // ZSET 的 value 必须是字符串
    );
    // 保留最近 90 天
    const cutoff = timestamp - 90 * 86400 * 1000;
    await this.redis.zremrangebyscore(`price:history:${id}`, 0, cutoff);
  }
  
  return updated;
}
```

**步骤 2: Python 侧 - 读真实历史**

**文件**: `python-ai/app/agents/price_compare_agent.py`

```python
# 替换 _get_mock_history
def _get_real_history(self, product_id: int) -> List[Dict]:
    """从 Redis 读真实历史价格"""
    import redis
    r = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    key = f"price:history:{product_id}"
    
    # ZRANGE 取全部,带 score(时间戳)
    raw = r.zrange(key, 0, -1, withscores=True)
    
    if not raw:
        return []  # 没有历史数据,返回空(不要造假!)
    
    history = []
    for price_str, timestamp in raw:
        history.append({
            "timestamp": int(timestamp),
            "price": float(price_str)
        })
    return history
```

**步骤 3: 在 _execute 里用真实数据**

```python
async def _execute(self, message, ...):
    # ...
    history = self._get_real_history(product.get("id", 0))
    
    if not history:
        return f"{product['name']} 目前没有历史价格数据,无法判断是否打折。"
    
    # 真实趋势分析
    current_price = float(product.get("price", 0))
    avg_price = sum(h["price"] for h in history) / len(history)
    min_price = min(h["price"] for h in history)
    max_price = max(h["price"] for h in history)
    
    if current_price < avg_price * 0.9:
        analysis = f"当前价格 {current_price} 元低于历史均价 {avg_price:.1f} 元,是真降价。"
    elif current_price > avg_price * 1.1:
        analysis = f"当前价格 {current_price} 元高于历史均价 {avg_price:.1f} 元,涨价了。"
    else:
        analysis = f"当前价格 {current_price} 元接近历史均价 {avg_price:.1f} 元,价格正常。"
    # ...
```

### 工作量

- 半天

---

## P1-3: 售后不退款

### 问题现象

用户说"少送了一个菜,要退款",AI 只回复"请描述您遇到的问题",**不调退款 API**。

### 根因

**文件**: `python-ai/app/agents/aftersales_agent.py`

Agent 只做意图引导,没有调 `PUT /api/orders/:id/cancel` 接口。

### 参考方案: 调 NestJS 取消订单接口

你的 NestJS 已经有 `PUT /api/orders/:id/cancel`(之前测试过返回 200)。让 Agent 真调这个接口。

### 具体改造

**文件**: `python-ai/app/agents/aftersales_agent.py`

```python
async def _execute(self, message, user_id, session_id, entities, history=None):
    history = history or []
    
    # Step 1: 检查用户是否在确认取消
    if self._is_cancel_confirmation(message, history):
        order_id = self._extract_order_id(history)
        if order_id:
            result = await call_nestjs_api(
                f"/api/orders/{order_id}/cancel",
                method="PUT",
                data={"reason": "用户申请退款"}
            )
            if result["status"] == 200:
                self.record_tool_usage("cancel_order")
                return f"✅ 订单 {order_id} 已取消,退款将在1-3个工作日到账。"
            else:
                return f"取消订单失败: {result.get('data', {})}"
    
    # Step 2: 从消息里提取订单号
    order_id = self._extract_order_id_from_message(message)
    if order_id:
        return (
            f"找到您的订单 {order_id}。\n"
            f"确认要取消并退款吗?\n"
            f"回复'确认退款'即可。"
        )
    
    # Step 3: 引导用户描述问题(原有逻辑)
    return "请描述您遇到的问题,例如:\n- 我的订单少送了一个菜\n- 我要申请退款\n- 商品质量有问题"
```

### 工作量

- 半天(依赖 P0-1 多轮记忆)

---

## P2-1: 缓存形同虚设

### 问题现象

同一问题问两次,第二次**不比第一次快**。因为:
- `LangChainRAG` 的 Redis 缓存只对**完全相同的 query**(MD5 匹配)生效;
- `chat` 接口每次都走完整 Agent 链路,**不经过 RAG 缓存**。

### 参考方案: 语义缓存(Semantic Cache)

**参考项目**:
- GPTCache: `github.com/zilliztech/GPTCache`(2k+ star)
- Redis VL: `redis.io/docs/latest/develop/use-cases/semantic-caching/`

**核心机制**: 不比较 query 文本是否相同,而是比较 **query 的 embedding 是否相似**。相似度 > 阈值 → 直接返回缓存的答案。

```
用户: "推荐评分最高的菜"  → 缓存
用户: "评分最高的菜有哪些" → embedding 相似度 0.96 → 命中缓存,直接返回!
```

### 具体改造

**新文件**: `python-ai/app/core/semantic_cache.py`

```python
"""语义缓存 - 基于 Redis + Embedding 相似度"""
import json
import os
import redis
import numpy as np
from app.core.embedding import get_embedding

_cache_redis = None

def get_cache_redis():
    global _cache_redis
    if _cache_redis is None:
        _cache_redis = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    return _cache_redis


async def semantic_get(query: str, threshold: float = 0.95) -> Optional[str]:
    """语义查询缓存"""
    r = get_cache_redis()
    query_emb = await get_embedding().embed_async(query, etype="query")
    
    # 遍历所有缓存的 query embedding(简化版,生产用 Redis Vector Search)
    keys = r.keys("sem_cache:*")
    for key in keys:
        cached = json.loads(r.get(key))
        cached_emb = np.array(cached["embedding"])
        similarity = np.dot(query_emb, cached_emb) / (
            np.linalg.norm(query_emb) * np.linalg.norm(cached_emb)
        )
        if similarity > threshold:
            return cached["response"]  # 命中!
    return None


async def semantic_set(query: str, response: str, ttl: int = 3600):
    """写入语义缓存"""
    r = get_cache_redis()
    emb = await get_embedding().embed_async(query, etype="query")
    key = f"sem_cache:{hash(query) % 1000000}"
    r.setex(key, ttl, json.dumps({
        "query": query,
        "embedding": emb,
        "response": response
    }))
```

**改造 `routes.py` 的 chat 接口**:

```python
@router.post("/chat")
async def chat(request: ChatRequest, ...):
    # 新增: 语义缓存查询
    from app.core.semantic_cache import semantic_get, semantic_set
    cached = await semantic_get(request.message)
    if cached:
        return {
            "response": cached,
            "intent": "cached",
            "agent": "semantic_cache",
            "cached": True,
            ...
        }
    
    # 原有 Agent 链路
    result = await orchestrator.route(...)
    
    # 新增: 写入语义缓存
    await semantic_set(request.message, result["response"])
    
    return result
```

### 工作量

- 1 天

---

## P2-2: 高并发延迟飙升

### 问题现象

20 并发 AI 请求:全部成功,但**最慢 7 秒**(智谱 API 限流导致队列堆积)。

### 参考方案: slowapi 限流 + 多进程

**参考项目**:
- slowapi: `github.com/laurentS/slowapi`(2k+ star)
- 文档: `slowapi.readthedocs.io`

**核心机制**: 基于 IP/用户的令牌桶限流,超限返回 429 + Retry-After。

### 具体改造

**步骤 1: 安装 slowapi**

```bash
# python-ai/requirements.txt
slowapi>=0.1.9
```

**步骤 2: 在 main.py 注册限流器**

```python
# python-ai/app/main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

**步骤 3: 给 chat 接口加限流**

```python
# python-ai/app/api/routes.py
from app.main import limiter

@router.post("/chat")
@limiter.limit("10/minute")  # 每IP每分钟10次
async def chat(request: ChatRequest, ...):
    ...
```

**步骤 4: uvicorn 多进程(利用 2 核)**

```dockerfile
# python-ai/Dockerfile 的 CMD 改为
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "2"]
```

### 工作量

- 半天

---

## P2-3: AI 意图识别误判

### 问题现象

| 用户输入 | 期望意图 | 实际意图 |
|---|---|---|
| "我要下单辣椒炒肉" | `nl_order` | `price_compare` ❌ |
| "商家搞个满减活动" | `marketing` | `smart_bargain` ❌ |

### 根因

**文件**: `python-ai/app/core/intent_classifier.py`

只用 embedding 相似度(单路),"辣椒炒肉"这个实体词在 `nl_order` 和 `price_compare` 的例句里都出现,导致误判。

### 参考方案: 规则快路 + 多特征融合(学 Rasa DIET)

**参考项目**:
- Rasa DIET: `rasa.com/blog/introducing-dual-intent-and-entity-transformer-diet`
- semantic-router: `github.com/aurelio-labs/semantic-router`(HybridRouter)

**核心机制**(三明治三层):
1. **规则快路**(学 Rasa Rule Policy):正则匹配强动作词,命中直接返回;
2. **稠密特征**(embedding):原有逻辑;
3. **稀疏特征**(CountVectors,学 Rasa):词 n-gram 捕捉动作短语;
4. **混合打分**:稠密 60% + 稀疏 40%;
5. **Fallback**(学 Rasa Fallback Policy):置信度 < 0.55 走兜底。

### 具体改造

见之前讨论的完整方案,此处不再重复。核心改动:

**文件**: `python-ai/app/core/intent_classifier.py`

```python
# 1. 新增规则快路
STRONG_RULES = {
    "nl_order": [r"我要?下单", r"帮我?点(餐|菜)", r"来一份", r"点个", r"订(餐|单)"],
    "marketing": [r"搞?个?活动", r"策划.*促销", r"活动文案", r"推广方案", r"满减活动"],
    "aftersales": [r"退款", r"退货", r"投诉", r"少送", r"漏发", r"还没到"],
}

def rule_fast_path(message: str) -> Optional[str]:
    for intent, patterns in STRONG_RULES.items():
        for pattern in patterns:
            if re.search(pattern, message):
                return intent
    return None

# 2. 在 classify 方法里前置规则快路
async def classify(self, message, role="user"):
    # 规则快路
    rule_intent = rule_fast_path(message)
    if rule_intent:
        return {"intent": rule_intent, "confidence": 1.0, "method": "rule_fast_path"}
    
    # 原有 embedding 逻辑
    ...
```

### 工作量

- 半天

---

## 改造路线图

```
阶段1(基础,2-3天):
  P0-1 AI多轮记忆 (base.py + Redis历史)
    ↓ 依赖
阶段2(核心,1天):
  P0-2 AI真下单 (nl_order_agent调create_order)
  P0-3 go-service路由 (改调NestJS)
  P1-3 售后退款 (aftersales调cancel API)
    ↓ 不依赖
阶段3(数据,1.5天):
  P1-1 向量库换Qdrant (docker-compose + qdrant_vector.py)
  P1-2 比价接Redis真实历史
    ↓ 不依赖
阶段4(生产级,1.5天):
  P2-1 语义缓存 (semantic_cache.py)
  P2-2 限流 (slowapi + 多进程)
  P2-3 意图识别优化 (规则快路)

总计: 6-8天
```

### 依赖关系

```
P0-1(多轮记忆) ──→ P0-2(真下单)
                ──→ P1-3(退款)
                
P0-3(go路由)    独立
P1-1(Qdrant)   独立
P1-2(比价)     独立
P2-1(缓存)     独立
P2-2(限流)     独立
P2-3(意图)     独立
```

### 每阶段交付物

| 阶段 | 做完能验证什么 |
|---|---|
| 阶段1 | AI 能多轮对话("选方案1"→ AI 记得上一轮) |
| 阶段2 | AI 能真下单("下单拍黄瓜"→ 真创建订单) |
| 阶段3 | 向量库重启不丢 + 比价是真数据 |
| 阶段4 | 20并发不卡 + 相似问题走缓存 + 意图识别准 |

---

## 附录: 所有参考开源项目一览

| 问题 | 参考项目 | GitHub/文档 |
|---|---|---|
| 多轮记忆 | LangGraph Redis Checkpointer | `redis-developer/langgraph-redis` |
| AI真下单 | Dify Agent + ReAct | `docs.dify.ai/zh/learn/tutorials/workflow-101/lesson-08` |
| 向量库 | Qdrant | `qdrant/qdrant` |
| 比价历史 | Redis ZSET | `redis.io/docs/data-types/sorted-sets/` |
| 语义缓存 | GPTCache | `zilliztech/GPTCache` |
| 限流 | slowapi | `laurentS/slowapi` |
| 意图识别 | Rasa DIET | `rasa.com/blog/introducing-dual-intent-and-entity-transformer-diet` |
| 意图识别 | semantic-router | `aurelio-labs/semantic-router` |
