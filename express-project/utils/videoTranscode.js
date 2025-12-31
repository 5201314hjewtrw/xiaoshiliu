/**
 * 视频转码工具 - 使用 FFmpeg 进行 DASH 编码
 * 支持动态码率配置
 * 支持从 .env 配置 FFmpeg 二进制文件路径
 */

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/config');
const { pool } = config;

/**
 * 初始化 FFmpeg 路径配置
 * 从 .env 配置读取 FFmpeg 和 FFprobe 二进制文件路径
 */
function initFfmpegPath() {
  const ffmpegPath = config.ffmpeg?.ffmpegPath;
  const ffprobePath = config.ffmpeg?.ffprobePath;
  
  // 设置 FFmpeg 路径
  if (ffmpegPath && ffmpegPath.trim() !== '') {
    if (fs.existsSync(ffmpegPath)) {
      ffmpeg.setFfmpegPath(ffmpegPath);
      console.log(`FFmpeg 路径已设置: ${ffmpegPath}`);
    } else {
      console.warn(`FFmpeg 路径不存在: ${ffmpegPath}，将尝试使用系统 PATH`);
    }
  }
  
  // 设置 FFprobe 路径
  if (ffprobePath && ffprobePath.trim() !== '') {
    if (fs.existsSync(ffprobePath)) {
      ffmpeg.setFfprobePath(ffprobePath);
      console.log(`FFprobe 路径已设置: ${ffprobePath}`);
    } else {
      console.warn(`FFprobe 路径不存在: ${ffprobePath}，将尝试使用系统 PATH`);
    }
  }
}

// 初始化 FFmpeg 路径
initFfmpegPath();

/**
 * 获取系统设置
 * @param {string} key - 设置键名
 * @param {string} defaultValue - 默认值
 * @returns {Promise<string>} 设置值
 */
async function getSetting(key, defaultValue = '') {
  try {
    const [rows] = await pool.execute(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      [key]
    );
    return rows.length > 0 ? rows[0].setting_value : defaultValue;
  } catch (error) {
    console.error(`获取设置 ${key} 失败:`, error);
    return defaultValue;
  }
}

/**
 * 获取视频转码配置
 * @returns {Promise<Object>} 转码配置
 */
async function getTranscodeConfig() {
  const [enabled, minBitrate, maxBitrate, format] = await Promise.all([
    getSetting('video_transcode_enabled', 'false'),
    getSetting('video_transcode_min_bitrate', '500'),
    getSetting('video_transcode_max_bitrate', '2500'),
    getSetting('video_transcode_format', 'dash')
  ]);

  return {
    enabled: enabled === 'true',
    minBitrate: parseInt(minBitrate, 10) || 500,
    maxBitrate: parseInt(maxBitrate, 10) || 2500,
    format: format || 'dash'
  };
}

/**
 * 获取当前 FFmpeg 配置信息
 * @returns {Object} FFmpeg 配置信息
 */
function getFfmpegConfig() {
  return {
    ffmpegPath: config.ffmpeg?.ffmpegPath || '(系统 PATH)',
    ffprobePath: config.ffmpeg?.ffprobePath || '(系统 PATH)'
  };
}

/**
 * 检查 FFmpeg 是否可用
 * @returns {Promise<boolean>} 是否可用
 */
function checkFfmpegAvailable() {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) {
        console.warn('FFmpeg 不可用:', err.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * 获取视频信息
 * @param {string} inputPath - 输入视频路径
 * @returns {Promise<Object>} 视频信息
 */
function getVideoInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        resolve({
          duration: metadata.format.duration,
          width: videoStream?.width,
          height: videoStream?.height,
          bitrate: metadata.format.bit_rate,
          videoCodec: videoStream?.codec_name,
          audioCodec: audioStream?.codec_name
        });
      }
    });
  });
}

/**
 * 生成视频质量配置
 * @param {Object} videoInfo - 视频信息
 * @param {number} minBitrate - 最小码率 (kbps)
 * @param {number} maxBitrate - 最大码率 (kbps)
 * @returns {Array} 质量配置数组
 */
function generateQualityLevels(videoInfo, minBitrate, maxBitrate) {
  const sourceHeight = videoInfo.height || 720;
  const qualities = [];

  // 根据源视频分辨率生成多个质量等级
  const qualityPresets = [
    { height: 360, label: '360p' },
    { height: 480, label: '480p' },
    { height: 720, label: '720p' },
    { height: 1080, label: '1080p' }
  ];

  // 只生成不超过源视频分辨率的质量等级
  const validPresets = qualityPresets.filter(q => q.height <= sourceHeight);
  
  if (validPresets.length === 0) {
    validPresets.push(qualityPresets[0]); // 至少保留360p
  }

  const bitrateStep = (maxBitrate - minBitrate) / Math.max(validPresets.length - 1, 1);

  validPresets.forEach((preset, index) => {
    const bitrate = Math.round(minBitrate + bitrateStep * index);
    qualities.push({
      height: preset.height,
      label: preset.label,
      bitrate: bitrate,
      maxrate: Math.round(bitrate * 1.2),
      bufsize: Math.round(bitrate * 2)
    });
  });

  return qualities;
}

/**
 * 转码视频为 DASH 格式
 * @param {string} inputPath - 输入视频路径
 * @param {string} outputDir - 输出目录
 * @param {Object} options - 转码选项
 * @returns {Promise<Object>} 转码结果
 */
async function transcodeToDash(inputPath, outputDir, options = {}) {
  const config = await getTranscodeConfig();
  
  if (!config.enabled) {
    return { success: false, message: '视频转码未启用' };
  }

  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    return { success: false, message: 'FFmpeg 不可用' };
  }

  try {
    // 获取视频信息
    const videoInfo = await getVideoInfo(inputPath);
    
    // 生成质量等级
    const qualities = generateQualityLevels(
      videoInfo,
      options.minBitrate || config.minBitrate,
      options.maxBitrate || config.maxBitrate
    );

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 生成唯一的输出文件名
    const hash = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const baseName = `video_${timestamp}_${hash}`;
    
    // 转码为各个质量等级
    const transcodedFiles = [];
    const transcodeErrors = [];
    
    for (const quality of qualities) {
      const outputFile = path.join(outputDir, `${baseName}_${quality.label}.mp4`);
      
      try {
        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .size(`?x${quality.height}`)
            .videoBitrate(`${quality.bitrate}k`)
            .outputOptions([
              `-maxrate ${quality.maxrate}k`,
              `-bufsize ${quality.bufsize}k`,
              '-preset medium',
              '-profile:v main',
              '-level 3.1',
              '-movflags +faststart'
            ])
            .on('start', (cmd) => {
              console.log(`开始转码 ${quality.label}: ${cmd}`);
            })
            .on('progress', (progress) => {
              console.log(`转码进度 ${quality.label}: ${Math.round(progress.percent || 0)}%`);
            })
            .on('end', () => {
              console.log(`转码完成 ${quality.label}`);
              transcodedFiles.push({
                quality: quality.label,
                path: outputFile,
                bitrate: quality.bitrate
              });
              resolve();
            })
            .on('error', (err) => {
              const errorMsg = `转码失败 [${quality.label}] (bitrate: ${quality.bitrate}k, height: ${quality.height}px): ${err.message}`;
              console.error(errorMsg);
              reject(new Error(errorMsg));
            })
            .save(outputFile);
        });
      } catch (qualityError) {
        console.warn(`质量等级 ${quality.label} 转码失败，继续处理其他质量等级:`, qualityError.message);
        transcodeErrors.push({ quality: quality.label, error: qualityError.message });
        // 继续处理其他质量等级，不中断整个流程
      }
    }

    // 如果没有任何质量等级转码成功，返回失败
    if (transcodedFiles.length === 0) {
      return {
        success: false,
        message: '所有质量等级转码均失败',
        errors: transcodeErrors
      };
    }

    // 生成 DASH manifest (MPD)
    const mpdPath = path.join(outputDir, `${baseName}.mpd`);
    await generateDashManifest(transcodedFiles, mpdPath, videoInfo);

    return {
      success: true,
      message: transcodeErrors.length > 0 ? `视频转码部分完成，${transcodeErrors.length}个质量等级失败` : '视频转码完成',
      data: {
        baseName,
        mpdPath,
        files: transcodedFiles,
        qualities: qualities.map(q => q.label)
      }
    };
  } catch (error) {
    console.error('视频转码失败:', error);
    return {
      success: false,
      message: error.message || '视频转码失败'
    };
  }
}

/**
 * 生成 DASH MPD 清单文件
 * @param {Array} files - 转码后的文件列表
 * @param {string} mpdPath - MPD 文件路径
 * @param {Object} videoInfo - 视频信息
 */
async function generateDashManifest(files, mpdPath, videoInfo) {
  const duration = videoInfo.duration || 0;
  const durationStr = formatDuration(duration);
  
  let representations = '';
  files.forEach((file, index) => {
    const fileName = path.basename(file.path);
    representations += `
      <Representation id="${index}" mimeType="video/mp4" codecs="avc1.4d401f,mp4a.40.2" bandwidth="${file.bitrate * 1000}">
        <BaseURL>${fileName}</BaseURL>
      </Representation>`;
  });

  const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="${durationStr}" minBufferTime="PT2S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4" contentType="video">
      ${representations}
    </AdaptationSet>
  </Period>
</MPD>`;

  fs.writeFileSync(mpdPath, mpd, 'utf8');
  console.log('DASH MPD 清单已生成:', mpdPath);
}

/**
 * 格式化时长为 ISO 8601 duration 格式
 * @param {number} seconds - 秒数
 * @returns {string} ISO 8601 duration 字符串
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  let duration = 'PT';
  if (hours > 0) duration += `${hours}H`;
  if (minutes > 0) duration += `${minutes}M`;
  duration += `${secs}S`;
  
  return duration;
}

/**
 * 清理转码临时文件
 * @param {string} outputDir - 输出目录
 * @param {string} baseName - 基础文件名
 */
function cleanupTranscodedFiles(outputDir, baseName) {
  try {
    const files = fs.readdirSync(outputDir);
    files.forEach(file => {
      if (file.startsWith(baseName)) {
        const filePath = path.join(outputDir, file);
        fs.unlinkSync(filePath);
        console.log('已清理转码文件:', filePath);
      }
    });
  } catch (error) {
    console.error('清理转码文件失败:', error);
  }
}

module.exports = {
  getSetting,
  getTranscodeConfig,
  getFfmpegConfig,
  checkFfmpegAvailable,
  getVideoInfo,
  transcodeToDash,
  generateQualityLevels,
  cleanupTranscodedFiles
};
