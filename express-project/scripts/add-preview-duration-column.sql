-- ============================================
-- 添加视频预览时长字段和预览视频URL
-- 用于存储付费视频的免费预览秒数和生成的预览视频
-- ============================================

-- 添加 preview_duration 列到 post_payment_settings 表
ALTER TABLE `post_payment_settings` 
ADD COLUMN `preview_duration` int(11) NOT NULL DEFAULT 0 COMMENT '视频预览时长（秒）' AFTER `free_preview_count`;

-- 添加 preview_video_url 列到 post_videos 表，用于存储生成的预览视频URL
ALTER TABLE `post_videos`
ADD COLUMN `preview_video_url` varchar(500) DEFAULT NULL COMMENT '预览视频URL' AFTER `video_url`;

-- 完成
SELECT '视频预览时长字段和预览视频URL添加完成！' AS message;
