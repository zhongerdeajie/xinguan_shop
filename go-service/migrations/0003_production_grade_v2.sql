-- ============================================================
-- Migration: 0003_production_grade_v2.sql
-- Date:     2026-08-20
-- Purpose:  根据 Tavily 行业调研修正 0002 遗留问题
--
-- 关键修正(Tavily 搜索证实):
--   1. 软删字段标准化: 删 is_deleted TINYINT, 只用 deleted_at TIMESTAMP NULL
--      (NULL = 活跃, 非 NULL = 已删时间) - 这是业界主流做法
--   2. 唯一索引冲突: 用 generated column "active" 解决
--      (deleted_at IS NULL 即 1, deleted_at 非空即 NULL -- MySQL 允许唯一索引多 NULL)
--   3. 库存锁定表: 新增 inventory_reservations
--      (高频秒杀场景必须 reservation, 防止 oversell)
--   4. 复合索引优化: orders 按 user_id+is_deleted+order_time 三列联合
--      (用户查历史订单是 99% 场景, 索引放最后把 is_deleted 带上)
--   5. 索引命名: 统一加 idx_ 前缀, 知道是显式建的索引
-- ============================================================

USE starselect;

-- ============================================================
-- 块 1: 软删字段标准化 -- 删 is_deleted, 加 generated column
-- ============================================================

-- 1.1 user 表: 删除 is_deleted, 校验 deleted_at
-- (用 IF EXISTS 防止 0002 已删, 列不存在的报错)
-- 注: MySQL 8.0 没有 DROP COLUMN IF EXISTS, 先查 information_schema
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='user' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE user DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.2 user 表: 加 generated column "active" 用于唯一索引
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='user' AND COLUMN_NAME='active');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE user ADD COLUMN active TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.3 user_coupon: 同样处理
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='user_coupon' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE user_coupon DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='user_coupon' AND COLUMN_NAME='active');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE user_coupon ADD COLUMN active TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.4 address_book (地址唯一性: 同一用户只有 1 个默认地址)
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='address_book' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE address_book DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='address_book' AND COLUMN_NAME='active');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE address_book ADD COLUMN active TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.5 简化其他表的 is_deleted (不删 unique-index 相关的列)
-- orders / order_detail / dish / coupon / browse_history / chat_message / shopping_cart / setmeal / employee / dish_review / payment_log / refund_log / category
-- 这些表没有"active 唯一"语义, 直接删 is_deleted 即可
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='orders' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE orders DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='order_detail' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE order_detail DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='shopping_cart' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE shopping_cart DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='browse_history' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE browse_history DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='chat_message' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE chat_message DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='dish' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE dish DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='coupon' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE coupon DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='setmeal' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE setmeal DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='employee' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE employee DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='dish_review' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE dish_review DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='payment_log' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE payment_log DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='refund_log' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE refund_log DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='category' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists>0, 'ALTER TABLE category DROP COLUMN is_deleted', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 块 2: 优化复合索引(把 deleted_at 纳入最常用查询索引)
-- ============================================================

-- 2.1 orders: 用户看历史订单 (99% 场景)
-- 删旧索引, 加新索引
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='orders' AND INDEX_NAME='idx_user_created');
SET @ddl := IF(@idx_exists>0, 'DROP INDEX idx_user_created ON orders', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='orders' AND INDEX_NAME='idx_user_active_created');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_user_active_created ON orders(user_id, deleted_at, order_time DESC)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.2 orders status filter: 后台管理按状态过滤
-- 已经有 idx_status_pay_status, 补 deleted_at 在前
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='orders' AND INDEX_NAME='idx_active_status_pay_status');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_active_status_pay_status ON orders(deleted_at, status, pay_status)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.3 browse_history: 加 deleted_at
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='browse_history' AND INDEX_NAME='idx_user_view_time');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_user_view_time ON browse_history(user_id, deleted_at, view_time DESC)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.4 chat_message: 加 deleted_at
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='chat_message' AND INDEX_NAME='idx_user_active_create');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_user_active_create ON chat_message(user_id, deleted_at, create_time)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.5 user_coupon: 用户查"我的可用券"
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='user_coupon' AND INDEX_NAME='idx_user_active');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_user_active ON user_coupon(user_id, active, status)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.6 user 表 active 唯一索引(邮箱活跃时唯一)
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='user' AND INDEX_NAME='uk_active_phone');
SET @ddl := IF(@idx_exists=0, 'CREATE UNIQUE INDEX uk_active_phone ON user(phone, active)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 块 3: 库存锁定表 (库存 reservation)
-- Tavily 证实: 高频秒杀场景必须 reservation, 防止 oversell
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_reservation (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    dish_id INT NOT NULL,
    quantity INT NOT NULL,
    status INT NOT NULL DEFAULT 0 COMMENT '0=预留 1=已扣减 2=已释放 3=超时',
    expires_at DATETIME(3) NOT NULL COMMENT 'TTL, 30分钟未确认自动释放',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    INDEX idx_order (order_id),
    INDEX idx_dish_status (dish_id, status),
    INDEX idx_expires (expires_at, status),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存预留表(秒杀防超卖)';

-- 配套定时任务: 释放过期 reservation
-- 用现有的 outbox-worker / stock-sync 调度, 这里只建表

-- ============================================================
-- 块 4: 收尾验证
-- ============================================================

SELECT 'is_deleted column count (should be 0)' AS msg, COUNT(*) AS cnt
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND COLUMN_NAME='is_deleted';

SELECT 'deleted_at column count' AS msg, COUNT(*) AS cnt
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND COLUMN_NAME='deleted_at';

SELECT 'active generated column count' AS msg, COUNT(*) AS cnt
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND COLUMN_NAME='active';

SELECT 'inventory_reservation table' AS msg, TABLE_NAME
FROM information_schema.TABLES WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='inventory_reservation';
