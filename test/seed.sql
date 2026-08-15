USE starselect;

-- 添加几个分类（如果不存在）
INSERT IGNORE INTO category (id, name, type, sort, status, create_time, update_time)
VALUES
(1, '荤菜', 1, 1, 1, NOW(), NOW()),
(2, '素菜', 1, 2, 1, NOW(), NOW()),
(3, '汤品', 1, 3, 1, NOW(), NOW()),
(4, '饮料', 2, 1, 1, NOW(), NOW());

-- 添加测试菜品
INSERT INTO dish (name, category_id, price, image, description, status, rating, sales, is_sponsored, create_time, update_time)
VALUES
('剁椒鱼头', 1, 68.00, 'http://example.com/duojiao.jpg', '招牌湘菜', 1, 4.8, 1520, false, NOW(), NOW()),
('回锅肉', 1, 58.00, '', '经典川菜', 1, 4.7, 980, false, NOW(), NOW()),
('清炒时蔬', 2, 28.00, '', '新鲜蔬菜', 1, 4.5, 720, false, NOW(), NOW()),
('番茄蛋汤', 3, 22.00, '', '家常汤', 1, 4.6, 850, false, NOW(), NOW()),
('可乐', 4, 3.50, '', '饮料', 1, 4.9, 9999, true, NOW(), NOW()),
('雪碧', 4, 3.50, '', '饮料', 1, 4.8, 8000, false, NOW(), NOW()),
('啤酒鸭', 1, 78.00, '', '特色菜', 1, 4.6, 560, false, NOW(), NOW()),
('紫菜蛋花汤', 3, 18.00, '', '清淡汤品', 1, 4.5, 430, false, NOW(), NOW()),
('宫保鸡丁', 1, 62.00, '', '川菜代表', 1, 4.7, 1100, false, NOW(), NOW()),
('凉拌黄瓜', 2, 16.00, '', '凉菜', 1, 4.4, 380, false, NOW(), NOW());