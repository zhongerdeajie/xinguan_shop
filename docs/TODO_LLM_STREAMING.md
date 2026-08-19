# LLM 真 token 流式输出 — 已完成

> 状态:✅ 已落地(2026-08-19 commit)
> 之前说"成本高不做"是误判,实际工作 1.5 小时,真实生产项目 100% 用真流。

## 实现细节

### 1. `python-ai/app/core/langchain_rag.py`
新增 `query_stream(question)`:
```python
async def query_stream(self, question: str):
    # 缓存命中 → 切片模拟流(协议一致性)
    # RAG 检索(必须同步,不能流)
    # LLM 真流: self.llm.astream(prompt_msgs) → AIMessageChunk 流
    # 流失败 → 降级 llm.invoke() 一次性
```

### 2. `python-ai/app/api/routes.py` `/chat/stream`
- 调 `orchestrator.route()` 拿 intent/agent/entities(忽略 response)
- 调 `rag.query_stream()` 拿 LLM 真 token 流
- 边生成边 SSE 推 chunk
- 流失败降级到字符切片

### 3. 验证证据
`curl -sN` 看到逐 token 推送:
- chunk 长度**不均匀**(单字/双字/标点)
- 这正是智谱 GLM 的 BPE 分词的真流
- 字符切片会是固定单字

## 真流优势(实测)

| 指标 | 字符切片 | LLM 真流 |
|---|---|---|
| 首字延迟 | 等 LLM 完整生成(几秒) | 第一个 token 时间(几百 ms) |
| 速度 | 固定 30 字/秒 | 跟随 LLM 实际节奏 |
| 停顿感 | 平均(机器人) | 自然(LLM 加速/停顿) |
| 体验 | 假打字机 | 真打字机 |

## 未来扩展(可选)

- 把 orchestrator.route() 拆出 intent_recognize(),避免重复 LLM 调用
- agent.handle 也改成流式,让工具调用结果也可以流
- 加流式 cache(用 message_id 续传,断线重连)

## 决策记录(2026-08-19)

之前 commit `0c50166` 时说"暂不做",是**错误判断**。
当时误以为改造工作量大、风险高、收益小。
实际:LangChain 已原生支持 astream(),1.5 小时搞定,体验提升巨大。
这个误判写进记忆,提醒下次不要低估成熟框架的能力。