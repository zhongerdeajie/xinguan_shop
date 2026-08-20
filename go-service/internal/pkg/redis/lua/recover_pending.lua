-- recover_pending.lua
-- 定时任务:扫描 pending 集合中超时未确认的订单,全部释放
-- 由 outbox-worker 定时调用(每 5 分钟), 安全幂等
--
-- KEYS[1] = pending_key
-- ARGV[1] = max_age_seconds  超时阈值(默认 1800 = 30 分钟)
-- ARGV[2] = now_ts           当前时间戳(秒), Go 层传入, 不能用 redis.call('TIME')
--
-- 返回值: 释放的条目数
--
-- v2 (2026-08-20):
--   - 用 pending value 里的 ts 字段判断超时, 不再全量清理
--   - 只释放超过 max_age 的订单, 正在处理中的订单不受影响
local pending_key = KEYS[1]
local max_age     = tonumber(ARGV[1]) or 1800
local now         = tonumber(ARGV[2]) or 0

local entries = redis.call('HGETALL', pending_key)
if #entries == 0 then
    return 0
end

local released = 0
-- entries 是平铺的数组: [k1, v1, k2, v2, ...]
for i = 1, #entries, 2 do
    local order_no = entries[i]
    local val      = entries[i + 1]
    if val ~= false then
        local decoded = cjson.decode(val)
        local ts = 0
        if type(decoded) == 'table' and type(decoded.ts) == 'number' then
            ts = decoded.ts
        end
        -- 未超时: 跳过(订单还在处理中)
        if now - ts < max_age then
            goto continue
        end

        -- 超时: 释放所有菜品库存
        local items
        if type(decoded) == 'table' and type(decoded.entries) == 'table' then
            items = decoded.entries
        elseif type(decoded) == 'string' then
            items = { decoded }
        else
            items = {}
        end

        for _, entry in ipairs(items) do
            local last_colon = 0
            for j = #entry, 1, -1 do
                if string.sub(entry, j, j) == ':' then
                    last_colon = j
                    break
                end
            end
            if last_colon > 0 then
                local stock_key = string.sub(entry, 1, last_colon - 1)
                local n_str     = string.sub(entry, last_colon + 1)
                local n         = tonumber(n_str)
                if n ~= nil and n > 0 then
                    redis.call('INCRBY', stock_key, n)
                    released = released + 1
                end
            end
        end
        redis.call('HDEL', pending_key, order_no)
    end
    ::continue::
end

return released