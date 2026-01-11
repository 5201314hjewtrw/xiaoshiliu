-- ============================================
-- 添加全部隐藏开关字段
-- 用于在付费设置中添加hide_all列
-- ============================================

-- 在 post_payment_settings 表中添加 hide_all 字段
-- 注意：此脚本假设 preview_duration 列已存在，如果不存在请先运行 add-preview-duration-column.sql
ALTER TABLE `post_payment_settings` 
ADD COLUMN IF NOT EXISTS `hide_all` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否全部隐藏内容（仅隐藏内容文字，不隐藏标题）';

-- 完成
SELECT '添加 hide_all 字段完成！' AS message;
