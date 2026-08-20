-- ============================================================
-- Migration: 0002_production_grade.sql
-- Date:     2026-08-20
-- Purpose:  把数据库升级到生产级标准
--
-- 设计原则:
--   1. 只增不改 —— 不删字段/不改类型, 不破坏现有数据
--   2. 软删 = 应用层实现 —— 不建触发器, 代码层加 WHERE is_deleted=0
--   3. 流水表只追加 —— 支付/退款/优惠券/评价 全部只 INSERT 不 UPDATE
--   4. 索引按真实查询频率补 —— 不预先建全覆盖索引
--   5. 大小写保留 —— dishFlavor 暂不改(影响 GORM 标签, 后续专门 patch)
--
-- 改动清单:
--   块 1: 13 张业务表加 is_deleted + deleted_at 字段
--   块 2: 7 个复合索引(按查询频率)
--   块 3: 5 张新表(payment_log, refund_log, dish_review, user_coupon_log, address_log)
-- ============================================================

USE starselect;

-- ============================================================
-- 块 1: 所有业务表加软删字段
-- 软删规则: 应用层 DELETE 改为 UPDATE SET is_deleted=1, deleted_at=NOW(3)
--           所有查询必须加 WHERE is_deleted=0
-- ============================================================

-- 1.1 user
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='user' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE user ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_user (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.2 address_book
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='address_book' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE address_book ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_addr (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.3 orders (最关键)
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='orders' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE orders ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_orders (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.4 order_detail
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='order_detail' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE order_detail ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_od (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.5 shopping_cart
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='shopping_cart' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE shopping_cart ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_cart (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.6 dish
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='dish' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE dish ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_dish (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.7 category
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='category' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE category ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_cat (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.8 browse_history
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='browse_history' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE browse_history ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_bh (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.9 chat_message
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='chat_message' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE chat_message ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_cm (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.10 user_coupon
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='user_coupon' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE user_coupon ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_uc (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.11 coupon
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='coupon' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE coupon ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_coupon (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.12 setmeal
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='setmeal' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE setmeal ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_sm (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.13 employee
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='employee' AND COLUMN_NAME='is_deleted');
SET @ddl := IF(@col_exists=0, 'ALTER TABLE employee ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0, ADD COLUMN deleted_at DATETIME(3) NULL, ADD INDEX idx_is_deleted_emp (is_deleted)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 块 2: 补全常用查询的复合索引
-- 原则: 索引建在最常用的 WHERE 组合上(explain 验证后再建)
-- ============================================================

-- 2.1 orders 按状态过滤 (后台管理"待接单/待付款")
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='orders' AND INDEX_NAME='idx_status_pay_status');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_status_pay_status ON orders(status, pay_status)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.2 orders 按用户+时间 (用户看"我的历史订单")
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='orders' AND INDEX_NAME='idx_user_created');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_user_created ON orders(user_id, order_time DESC)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.3 dish 首页菜单 按分类+在售(关联 category 表的 sort 排序)
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='dish' AND INDEX_NAME='idx_category_status');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_category_status ON dish(category_id, status)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.4 browse_history 按用户+时间倒序 (查"我的浏览记录")
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='browse_history' AND INDEX_NAME='idx_user_view_time');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_user_view_time ON browse_history(user_id, view_time DESC)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.5 user_coupon 按用户+状态 (查"我的可用券")
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='user_coupon' AND INDEX_NAME='idx_user_status_uc');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_user_status_uc ON user_coupon(user_id, status)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.6 chat_message 按用户+时间 (聊天历史)
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='chat_message' AND INDEX_NAME='idx_user_create_cm');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_user_create_cm ON chat_message(user_id, create_time)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.7 order_detail 按订单+菜品 (查某个订单的所有菜)
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME='order_detail' AND INDEX_NAME='idx_order_dish');
SET @ddl := IF(@idx_exists=0, 'CREATE INDEX idx_order_dish ON order_detail(order_id, dish_id)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 块 3: 新增生产级表
-- 原则: 流水表只追加 INSERT, 不 UPDATE / DELETE(审计需要)
-- ============================================================

-- 3.1 payment_log: 支付流水(每次支付请求一条)
CREATE TABLE IF NOT EXISTS payment_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL COMMENT 'orders.id',
    user_id INT NOT NULL,
    payment_method INT NOT NULL COMMENT '1=微信 2=支付宝 3=余额',
    amount DECIMAL(10,2) NOT NULL,
    transaction_id VARCHAR(64) DEFAULT NULL COMMENT '第三方流水号',
    status INT NOT NULL DEFAULT 0 COMMENT '0=发起 1=成功 2=失败 3=已退款',
    request_payload TEXT DEFAULT NULL COMMENT '发起接口的原始请求',
    response_payload TEXT DEFAULT NULL COMMENT '回调原始响应',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    is_deleted TINYINT NOT NULL DEFAULT 0,
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    INDEX idx_paylog_order (order_id),
    INDEX idx_paylog_user_created (user_id, created_at),
    INDEX idx_paylog_status (status),
    INDEX idx_paylog_is_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付流水表';

-- 3.2 refund_log: 退款记录
CREATE TABLE IF NOT EXISTS refund_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    payment_log_id BIGINT UNSIGNED NOT NULL COMMENT '退款对应原支付',
    order_id BIGINT UNSIGNED NOT NULL,
    user_id INT NOT NULL,
    refund_amount DECIMAL(10,2) NOT NULL,
    refund_reason VARCHAR(255) DEFAULT NULL,
    transaction_id VARCHAR(64) DEFAULT NULL COMMENT '退款流水号',
    status INT NOT NULL DEFAULT 0 COMMENT '0=发起 1=成功 2=失败',
    request_payload TEXT DEFAULT NULL,
    response_payload TEXT DEFAULT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    is_deleted TINYINT NOT NULL DEFAULT 0,
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    INDEX idx_refund_order (order_id),
    INDEX idx_refund_payment_log (payment_log_id),
    INDEX idx_refund_user_created (user_id, created_at),
    INDEX idx_refund_is_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='退款记录';

-- 3.3 dish_review: 菜品原始评分(每次评价一条)
CREATE TABLE IF NOT EXISTS dish_review (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    user_id INT NOT NULL,
    dish_id INT NOT NULL,
    rating TINYINT NOT NULL COMMENT '1-5 星',
    content VARCHAR(500) DEFAULT NULL,
    images JSON DEFAULT NULL COMMENT '评价图片 URL 数组',
    is_anonymous TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    is_deleted TINYINT NOT NULL DEFAULT 0,
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    INDEX idx_review_dish_created (dish_id, created_at),
    INDEX idx_review_user (user_id),
    INDEX idx_review_order (order_id),
    INDEX idx_review_is_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='菜品评价';

-- 3.4 user_coupon_log: 券的领/用/过期 流水
CREATE TABLE IF NOT EXISTS user_coupon_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    coupon_id INT NOT NULL,
    user_coupon_id INT NOT NULL,
    action VARCHAR(16) NOT NULL COMMENT 'CLAIMED/USED/EXPIRED/REFUNDED',
    order_id BIGINT UNSIGNED DEFAULT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    INDEX idx_couponlog_user_coupon (user_coupon_id),
    INDEX idx_couponlog_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='优惠券流水';

-- 3.5 address_log: 地址修改历史(防止改了地址后历史订单无法复原)
CREATE TABLE IF NOT EXISTS address_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    address_id INT NOT NULL,
    user_id INT NOT NULL,
    snapshot JSON NOT NULL COMMENT '完整地址快照',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    INDEX idx_addrlog_address (address_id),
    INDEX idx_addrlog_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='地址修改历史';

-- ============================================================
-- 块 4: 收尾验证(SELECT 几条 inventory 查询)
-- ============================================================
SELECT 'soft delete columns count' AS msg, COUNT(*) AS cnt FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='starselect' AND COLUMN_NAME='is_deleted';

SELECT 'new tables created' AS msg, TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA='starselect' AND TABLE_NAME IN ('payment_log', 'refund_log', 'dish_review', 'user_coupon_log', 'address_log')
    ORDER BY TABLE_NAME;
