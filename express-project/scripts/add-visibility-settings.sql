-- 添加可见性设置迁移脚本
-- Add visibility settings migration script

USE `xiaoshiliu`;

-- 1. 添加visibility字段到posts表
-- Add visibility column to posts table
ALTER TABLE `posts` 
ADD COLUMN `visibility` ENUM('public', 'private', 'mutual_followers') NOT NULL DEFAULT 'public' COMMENT '可见性设置：public-公开，private-私密，mutual_followers-仅互关好友可见' 
AFTER `is_draft`;

-- 2. 添加索引以优化查询性能
-- Add index to optimize query performance
ALTER TABLE `posts` 
ADD INDEX `idx_visibility` (`visibility`);

-- 3. 将category_id改为可选（如果还没有的话）
-- Make category_id optional (if not already)
ALTER TABLE `posts` 
MODIFY COLUMN `category_id` INT(11) DEFAULT NULL COMMENT '分类ID（可选）';

-- 4. 更新现有数据，将所有现有笔记的可见性设置为公开
-- Update existing posts to set visibility as public
UPDATE `posts` 
SET `visibility` = 'public' 
WHERE `visibility` IS NULL OR `visibility` = '';

-- 完成
SELECT '可见性设置迁移完成！' AS message;
SELECT COUNT(*) AS total_posts FROM posts;
SELECT visibility, COUNT(*) as count FROM posts GROUP BY visibility;
