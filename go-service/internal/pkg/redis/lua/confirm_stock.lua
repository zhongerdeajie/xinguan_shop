-- confirm_stock.lua
-- 提交成功:从 pending 删除,真实扣减已经发生,无需回补
-- 异步场景:OrderService.SubmitOrder 走完 MySQL 事务后调用,清理 pending 标记
--
-- KEYS[1] = pending_key      例: pending:order
-- ARGV[1] = order_no
--
-- 返回值: 被删除的 pending 条数(0 或 1)
local pending_key = KEYS[1]
local order_no    = ARGV[1]

return redis.call('HDEL', pending_key, order_no)