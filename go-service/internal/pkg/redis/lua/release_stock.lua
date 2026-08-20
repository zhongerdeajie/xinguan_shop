-- release_stock.lua
-- 释放预占:把 pending 记录的库存回补,然后清除 pending 标记
-- 用法:
--   - 用户取消订单(库存原路返还)
--   - 提交订单失败(回滚)
--   - 超时未支付的订单(scheduler 兜底清理)
--
-- KEYS[1] = pending_key
-- ARGV[1] = order_no
--
-- 返回值: 回补的库存条目数(0 表示 pending 已不存在, 通常是正常)
local pending_key = KEYS[1]
local order_no    = ARGV[1]

local val = redis.call('HGET', pending_key, order_no)
if val == false then
    return 0
end

-- val 形如 "dish:42:stock:2", 拆出 stock_key 与 number
local last_colon = 0
for i = #val, 1, -1 do
    if string.sub(val, i, i) == ':' then
        last_colon = i
        break
    end
end

if last_colon == 0 then
    -- 异常:从 pending 删除, 不做补偿
    redis.call('HDEL', pending_key, order_no)
    return 0
end

local stock_key = string.sub(val, 1, last_colon - 1)
local n_str     = string.sub(val, last_colon + 1)
local n         = tonumber(n_str)
if n == nil or n <= 0 then
    redis.call('HDEL', pending_key, order_no)
    return 0
end

local restored = redis.call('INCRBY', stock_key, n)
redis.call('HDEL', pending_key, order_no)
return restored