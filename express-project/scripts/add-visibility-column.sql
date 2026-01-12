-- 添加笔记可见性设置功能
-- 可见性类型：0-公开，1-私密，2-仅互关好友可见

-- 添加 visibility 列到 posts 表
ALTER TABLE `posts` 
ADD COLUMN `visibility` tinyint(1) NOT NULL DEFAULT 0 COMMENT '可见性：0-公开，1-私密，2-仅互关好友可见' 
AFTER `is_draft`;

-- 添加索引以提高查询性能
ALTER TABLE `posts` 
ADD INDEX `idx_visibility` (`visibility`);

-- 添加组合索引以优化常见查询
ALTER TABLE `posts` 
ADD INDEX `idx_is_draft_visibility` (`is_draft`, `visibility`);
