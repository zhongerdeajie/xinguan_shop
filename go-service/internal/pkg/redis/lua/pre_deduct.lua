-- pre_deduct.lua
-- 原子预扣:校验 + 扣减 + 写 pending 集合
--
-- KEYS[1] = stock_key        例: dish:42:stock
-- KEYS[2] = pending_key      例: pending:order
-- ARGV[1] = number           要扣减的份数(整数)
-- ARGV[2] = order_no         订单号(用作 pending 集合的 member)
-- ARGV[3] = init_value       stock_key 不存在时的初始化值
-- ARGV[4] = now_ts           Go 层传入的当前时间戳(秒), 不能用 redis.call('TIME'), 那是非确定性命令
--
-- 返回值:
--   >= 0 : 扣减后的剩余库存(成功)
--    -1 : ARGV[1] 不是正整数
--    -2 : 库存不足(key 不存在且 init<需求 也算不足)
--
-- pending 结构 (v2, 2026-08-20 修复多菜品覆盖 bug):
--   HSET pending:order <order_no> '{"entries":["dish:1:stock:2","dish:2:stock:1"],"ts":1724160000}'
--   - entries: 该订单所有菜品的扣减记录(JSON 数组), 支持多菜品
--   - ts: 首次预扣时间戳, 供 recover_pending 判断超时
--   - 同一个 order_no 多次 HSET 会追加到 entries, 不再覆盖
local stock_key   = KEYS[1]
local pending_key = KEYS[2]
local n           = tonumber(ARGV[1])
local order_no    = ARGV[2]
local init_str    = ARGV[3]
local now_ts      = tonumber(ARGV[4]) or 0

if n == nil or n <= 0 then
    return -1
end

local cur = redis.call('GET', stock_key)
if cur == false then
    -- key 不存在:仅当 init_value 足够时才允许"开张就卖"
    local init = tonumber(init_str)
    if init == nil or init < n then
        return -2
    end
    redis.call('SET', stock_key, init)
    cur = init
else
    cur = tonumber(cur)
end

if cur < n then
    return -2
end

local remaining = redis.call('DECRBY', stock_key, n)

-- 追加到 pending(JSON 数组, 支持多菜品)
local entry = stock_key .. ':' .. ARGV[1]
local existing = redis.call('HGET', pending_key, order_no)
if existing == false then
    local payload = cjson.encode({ entries = { entry }, ts = now_ts })
    redis.call('HSET', pending_key, order_no, payload)
else
    local decoded = cjson.decode(existing)
    if type(decoded) ~= 'table' or type(decoded.entries) ~= 'table' then
        -- 兼容旧格式(单字符串): 转成新格式
        decoded = { entries = { existing }, ts = now_ts }
    end
    table.insert(decoded.entries, entry)
    redis.call('HSET', pending_key, order_no, cjson.encode(decoded))
end
redis.call('EXPIRE', pending_key, 86400)

return remaining