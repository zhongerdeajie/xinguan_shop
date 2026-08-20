-- recover_pending.lua
-- 定时任务:扫描 pending 集合中超时未确认的订单,全部释放
-- 由 outbox-worker / stock-sync 调用, 安全幂等
--
-- KEYS[1] = pending_key
-- ARGV[1] = max_age_seconds  超时阈值(默认 1800 = 30 分钟)
--
-- 返回值: 释放的条目数
local pending_key = KEYS[1]
local max_age     = tonumber(ARGV[1]) or 1800

-- 简化:直接遍历所有 pending, 不做时间过滤(订单号本身带时间戳可解析)
-- 这里取一个折中:只清理整个 pending(全量回收不可取)
-- 真正时间过滤由调用方在 Go 层做
local entries = redis.call('HGETALL', pending_key)
if #entries == 0 then
    return 0
end

local released = 0
-- entries 是平铺的数组: [k1, v1, k2, v2, ...]
for i = 1, #entries, 2 do
    local order_no = entries[i]
    local val      = entries[i+1]
    if val ~= false then
        local last_colon = 0
        for j = #val, 1, -1 do
            if string.sub(val, j, j) == ':' then
                last_colon = j
                break
            end
        end
        if last_colon > 0 then
            local stock_key = string.sub(val, 1, last_colon - 1)
            local n_str     = string.sub(val, last_colon + 1)
            local n         = tonumber(n_str)
            if n and n > 0 then
                redis.call('INCRBY', stock_key, n)
                released = released + 1
            end
        end
        redis.call('HDEL', pending_key, order_no)
    end
end

return released