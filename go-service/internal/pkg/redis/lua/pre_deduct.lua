-- pre_deduct.lua
-- 原子预扣:校验 + 扣减 + 写 pending 集合
--
-- KEYS[1] = stock_key        例: dish:42:stock
-- KEYS[2] = pending_key      例: pending:order
-- ARGV[1] = number           要扣减的份数(整数)
-- ARGV[2] = order_no         订单号(用作 pending 集合的 member)
-- ARGV[3] = init_value       stock_key 不存在时的初始化值
--
-- 返回值:
--   >= 0 : 扣减后的剩余库存(成功)
--    -1 : ARGV[1] 不是正整数
--    -2 : 库存不足(key 不存在且 init<需求 也算不足)
local stock_key   = KEYS[1]
local pending_key = KEYS[2]
local n           = tonumber(ARGV[1])
local order_no    = ARGV[2]
local init_str    = ARGV[3]

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
-- pending 用 hash 存储, value 是 stock_key 路径 + 扣减数量
-- worker 知道按路径去找对应的 stock key 反向 IncrBy
redis.call('HSET', pending_key, order_no, stock_key .. ':' .. ARGV[1])
redis.call('EXPIRE', pending_key, 86400)

return remaining