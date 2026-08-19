# TODO: LLM 真 token 流式输出

> 当前状态: 已用字符切片模拟打字机效果(每字 33ms)
> 目标状态: 直接推送 LLM token,真正"边生成边显示"

## 当前实现(已落地)

- `python-ai/app/api/routes.py` `/chat/stream` 端点
- orchestrator 同步返回完整 result,然后字符切片逐字推送 SSE
- 前端 `next-web/src/app/assistant/page.tsx` 用 fetch + ReadableStream 解析
- 实测: 首字延迟 < 50ms,打字机视觉效果良好

## 真 LLM 流(待升级)优势

- **首字延迟更低**: LLM 生成第一个 token 就推送(几十 ms vs 当前等完整结果再切片)
- **带宽感知**: 响应大时差异明显(LLM 生成 30 字 vs 几百字)
- **更"自然"**: 不依赖 `sleep(0.033)` 模拟,真正跟随 LLM 节奏

## 改造方案

### 1. orchestrator.route() 加流式版本

```python
# 当前: async def route(...) -> dict
# 改: async def route_stream(...) -> AsyncGenerator[dict]
#   yield {"type": "meta", ...}
#   yield {"type": "token", "delta": "你"}
#   ...
#   yield {"type": "done", ...}
```

### 2. agent.handle 加流式版本

- `langgraph_agent.py` 已有 `stream()` 方法用 `astream`,直接用
- `ecommerce_agent.py` 同上
- `nl_order_agent.py` 等需要补

### 3. SSE 端点改造

```python
async def chat_stream(...):
    async for event in orchestrator.route_stream(...):
        yield f"data: {json.dumps(event)}\n\n"
```

### 4. 风险与权衡

- orchestrator 是核心路径,改动影响所有 6 个 Agent
- 需要保证非流式路径仍然能跑(兼容旧前端)
- 当前字符切片已满足"打字机"视觉效果,收益 < 风险
- 建议: 等用户量上来或响应慢成瓶颈时再做

## 决策

**当前不做**。字符切片方案已通过 commit `d49f3d0` 落地,前端打字机体验良好。
**未来触发条件**: 用户反馈"AI 响应慢" 或 "首字延迟大" 时,启动此改造。