-- ============================================
-- 为图片添加 is_free 字段迁移脚本
-- 用于标记每张图片是否为免费可查看
-- ============================================

-- 添加 is_free 列到 post_images 表
ALTER TABLE `post_images` 
ADD COLUMN `is_free` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否免费可查看：1-免费，0-需付费';

-- 根据现有的 free_preview_count 设置初始值
-- 将前 N 张图片设置为免费（N = free_preview_count）
UPDATE post_images pi
JOIN (
    SELECT pi2.id, pi2.post_id,
           ROW_NUMBER() OVER (PARTITION BY pi2.post_id ORDER BY pi2.id) as rn,
           COALESCE(pps.free_preview_count, 999999) as free_count
    FROM post_images pi2
    LEFT JOIN post_payment_settings pps ON pi2.post_id = pps.post_id
) ranked ON pi.id = ranked.id
SET pi.is_free = CASE WHEN ranked.rn <= ranked.free_count THEN 1 ELSE 0 END;

-- 对于没有付费设置的帖子，所有图片都设为免费
UPDATE post_images pi
SET pi.is_free = 1
WHERE NOT EXISTS (
    SELECT 1 FROM post_payment_settings pps 
    WHERE pps.post_id = pi.post_id AND pps.enabled = 1
);

-- 完成
SELECT '图片 is_free 字段添加完成！' AS message;
