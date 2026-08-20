-- ============================================================
-- Migration: 0001_production_stock.sql
-- Date:     2026-08-20
-- Purpose:  真正的生产级库存模型
--
-- 这一组变更把 Go service 的下单/退款链路从"Redis 唯一起源"
-- 改成"Redis 预占 + MySQL 事实"的双源最终一致架构。
--
-- 变更点：
-- 1. dish 加 stock / version 列（version 是乐观锁）
-- 2. 新增 outbox_events 表（同事务写订单+事件，杜绝跨存储漂移）
-- 3. 新增 stock_audit_log 表（库存漂移审计，运维追溯）
-- ============================================================

USE sky_take_out;

-- ------------------------------------------------------------
-- 1. dish 表：库存真值 + 乐观锁
-- ------------------------------------------------------------
ALTER TABLE dish
    ADD COLUMN stock       INT NOT NULL DEFAULT 0
        COMMENT '真实库存(数字, 0=售罄)' AFTER description,
    ADD COLUMN version     INT NOT NULL DEFAULT 0
        COMMENT '乐观锁版本号, 每次 UpdateDish 自增' AFTER stock,
    ADD COLUMN stock_alert INT NOT NULL DEFAULT 10
        COMMENT '低库存阈值, < 该值触发告警' AFTER version;

-- 初始库存:全 0(售罄), 等管理员通过菜品管理页面初始化
-- 之前 redis SetNX 默认 100 是 P1 bug, 永远卖得出去; 这里强制走菜品编辑 API
UPDATE dish SET stock = 0 WHERE stock IS NULL;

-- ------------------------------------------------------------
-- 2. outbox_events: 事件表, 与 orders 同事务写入
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox_events (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    aggregate    VARCHAR(64)  NOT NULL
        COMMENT '聚合根, 例: order / refund',
    aggregate_id BIGINT UNSIGNED NOT NULL
        COMMENT '聚合根 ID',
    event_type   VARCHAR(64)  NOT NULL
        COMMENT '事件类型, 例: order.created / order.refunded',
    payload      JSON NOT NULL
        COMMENT '完整事件载荷(JSON)',
    status       TINYINT NOT NULL DEFAULT 0
        COMMENT '0=pending, 1=processed, 2=failed',
    retry_count  INT NOT NULL DEFAULT 0
        COMMENT '已重试次数',
    last_error   VARCHAR(512) DEFAULT NULL
        COMMENT '最近一次失败原因',
    created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    processed_at DATETIME(3) DEFAULT NULL,
    PRIMARY KEY (id),
    INDEX idx_status_created (status, created_at)
        COMMENT 'worker 拉取 pending 时按此索引',
    INDEX idx_aggregate (aggregate, aggregate_id)
        COMMENT '反查某订单的所有事件'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Outbox 模式事件表, 与业务表同事务提交, worker 异步消费';

-- ------------------------------------------------------------
-- 3. stock_audit_log: 库存漂移审计(校准 worker 写入)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_audit_log (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dish_id       INT NOT NULL,
    mysql_stock   INT NOT NULL COMMENT 'MySQL 中 dish.stock 当时值',
    redis_stock   INT NOT NULL COMMENT 'Redis 中 dish:{id}:stock 当时值',
    drift         INT NOT NULL COMMENT 'redis_stock - mysql_stock(理论应为 0)',
    action        VARCHAR(32) NOT NULL
        COMMENT 'synced / drifted / manual_fix',
    note          VARCHAR(255) DEFAULT NULL,
    created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    INDEX idx_dish_created (dish_id, created_at),
    INDEX idx_drift_created (drift, created_at)
        COMMENT '查漂移 > 0 的所有事件'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='库存漂移审计, 由校准 worker 写入';

-- ------------------------------------------------------------
-- 4. 索引补强:order_detail 加 dish_id 索引加速库存校准
-- ------------------------------------------------------------
ALTER TABLE order_detail
    ADD INDEX idx_dish (dish_id);

-- ------------------------------------------------------------
-- 5. 收尾验证
-- ------------------------------------------------------------
SELECT COUNT(*) AS dishes_with_stock FROM dish WHERE stock IS NOT NULL;
SELECT COUNT(*) AS outbox_total FROM outbox_events;
SELECT COUNT(*) AS audit_total FROM stock_audit_log;