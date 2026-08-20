-- release_stock.lua
-- 释放预占:把 pending 记录的所有菜品库存回补,然后清除 pending 标记
-- 用法:
--   - 用户取消订单(库存原路返还)
--   - 提交订单失败(回滚)
--   - 超时未支付的订单(scheduler 兜底清理)
--
-- KEYS[1] = pending_key
-- ARGV[1] = order_no
--
-- 返回值: 回补的库存条目数(0 表示 pending 已不存在, 通常是正常)
--
-- v2 (2026-08-20): 支持多菜品, 遍历 JSON 数组 entries 全部回补
local pending_key = KEYS[1]
local order_no    = ARGV[1]

local val = redis.call('HGET', pending_key, order_no)
if val == false then
    return 0
end

local restored = 0
local decoded = cjson.decode(val)

-- 兼容旧格式(单字符串 "dish:42:stock:2")与新格式(JSON 数组)
local entries
if type(decoded) == 'table' and type(decoded.entries) == 'table' then
    entries = decoded.entries
elseif type(decoded) == 'string' then
    entries = { decoded }
else
    -- 异常格式: 直接删除, 不做补偿(避免死循环)
    redis.call('HDEL', pending_key, order_no)
    return 0
end

for _, entry in ipairs(entries) do
    -- entry 形如 "dish:42:stock:2", 拆出 stock_key 与 number
    local last_colon = 0
    for i = #entry, 1, -1 do
        if string.sub(entry, i, i) == ':' then
            last_colon = i
            break
        end
    end
    if last_colon > 0 then
        local stock_key = string.sub(entry, 1, last_colon - 1)
        local n_str     = string.sub(entry, last_colon + 1)
        local n         = tonumber(n_str)
        if n ~= nil and n > 0 then
            redis.call('INCRBY', stock_key, n)
            restored = restored + 1
        end
    end
end

redis.call('HDEL', pending_key, order_no)
return restored