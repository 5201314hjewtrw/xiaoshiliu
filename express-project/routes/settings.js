/**
 * 系统设置 API 路由
 */

const express = require('express');
const router = express.Router();
const { HTTP_STATUS, RESPONSE_CODES } = require('../constants');
const { pool } = require('../config/config');
const { adminAuth } = require('../utils/uploadHelper');
const { checkFfmpegAvailable } = require('../utils/videoTranscode');

/**
 * 获取所有系统设置
 * GET /api/settings
 */
router.get('/', adminAuth, async (req, res) => {
  try {
    const { group } = req.query;
    
    let query = 'SELECT * FROM system_settings';
    const params = [];
    
    if (group) {
      query += ' WHERE setting_group = ?';
      params.push(group);
    }
    
    query += ' ORDER BY setting_group, setting_key';
    
    const [rows] = await pool.execute(query, params);
    
    // 将设置转换为对象格式
    const settings = {};
    rows.forEach(row => {
      if (!settings[row.setting_group]) {
        settings[row.setting_group] = {};
      }
      settings[row.setting_group][row.setting_key] = {
        value: row.setting_value,
        description: row.description
      };
    });
    
    res.json({
      code: RESPONSE_CODES.SUCCESS,
      message: '获取系统设置成功',
      data: settings
    });
  } catch (error) {
    console.error('获取系统设置失败:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      code: RESPONSE_CODES.ERROR,
      message: '获取系统设置失败'
    });
  }
});

/**
 * 获取单个设置
 * GET /api/settings/:key
 */
router.get('/:key', adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    
    const [rows] = await pool.execute(
      'SELECT * FROM system_settings WHERE setting_key = ?',
      [key]
    );
    
    if (rows.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        code: RESPONSE_CODES.NOT_FOUND,
        message: '设置不存在'
      });
    }
    
    res.json({
      code: RESPONSE_CODES.SUCCESS,
      message: '获取设置成功',
      data: rows[0]
    });
  } catch (error) {
    console.error('获取设置失败:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      code: RESPONSE_CODES.ERROR,
      message: '获取设置失败'
    });
  }
});

/**
 * 更新单个设置
 * PUT /api/settings/:key
 */
router.put('/:key', adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;
    
    if (value === undefined) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        code: RESPONSE_CODES.VALIDATION_ERROR,
        message: '缺少设置值'
      });
    }
    
    // 检查设置是否存在
    const [existing] = await pool.execute(
      'SELECT id FROM system_settings WHERE setting_key = ?',
      [key]
    );
    
    if (existing.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        code: RESPONSE_CODES.NOT_FOUND,
        message: '设置不存在'
      });
    }
    
    // 更新设置
    let updateQuery = 'UPDATE system_settings SET setting_value = ?';
    const params = [String(value)];
    
    if (description !== undefined) {
      updateQuery += ', description = ?';
      params.push(description);
    }
    
    updateQuery += ' WHERE setting_key = ?';
    params.push(key);
    
    await pool.execute(updateQuery, params);
    
    res.json({
      code: RESPONSE_CODES.SUCCESS,
      message: '更新设置成功',
      data: { key, value: String(value) }
    });
  } catch (error) {
    console.error('更新设置失败:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      code: RESPONSE_CODES.ERROR,
      message: '更新设置失败'
    });
  }
});

/**
 * 批量更新设置
 * PUT /api/settings
 */
router.put('/', adminAuth, async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        code: RESPONSE_CODES.VALIDATION_ERROR,
        message: '无效的设置数据'
      });
    }
    
    const updatedKeys = [];
    const errors = [];
    
    for (const [key, value] of Object.entries(settings)) {
      try {
        // 检查设置是否存在
        const [existing] = await pool.execute(
          'SELECT id FROM system_settings WHERE setting_key = ?',
          [key]
        );
        
        if (existing.length === 0) {
          // 如果不存在，创建新设置
          await pool.execute(
            'INSERT INTO system_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)',
            [key, String(value), key.split('_')[0] || 'general']
          );
        } else {
          // 更新现有设置
          await pool.execute(
            'UPDATE system_settings SET setting_value = ? WHERE setting_key = ?',
            [String(value), key]
          );
        }
        
        updatedKeys.push(key);
      } catch (err) {
        errors.push({ key, error: err.message });
      }
    }
    
    res.json({
      code: RESPONSE_CODES.SUCCESS,
      message: `成功更新 ${updatedKeys.length} 个设置`,
      data: {
        updated: updatedKeys,
        errors: errors
      }
    });
  } catch (error) {
    console.error('批量更新设置失败:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      code: RESPONSE_CODES.ERROR,
      message: '批量更新设置失败'
    });
  }
});

/**
 * 获取视频设置（包括FFmpeg状态）
 * GET /api/settings/video/status
 */
router.get('/video/status', adminAuth, async (req, res) => {
  try {
    // 获取视频相关设置
    const [rows] = await pool.execute(
      'SELECT * FROM system_settings WHERE setting_group = ?',
      ['video']
    );
    
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    // 检查FFmpeg是否可用
    const ffmpegAvailable = await checkFfmpegAvailable();
    
    res.json({
      code: RESPONSE_CODES.SUCCESS,
      message: '获取视频设置成功',
      data: {
        settings,
        ffmpegAvailable
      }
    });
  } catch (error) {
    console.error('获取视频设置失败:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      code: RESPONSE_CODES.ERROR,
      message: '获取视频设置失败'
    });
  }
});

/**
 * 创建新设置
 * POST /api/settings
 */
router.post('/', adminAuth, async (req, res) => {
  try {
    const { key, value, group, description } = req.body;
    
    if (!key || value === undefined) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        code: RESPONSE_CODES.VALIDATION_ERROR,
        message: '缺少必要参数'
      });
    }
    
    // 检查是否已存在
    const [existing] = await pool.execute(
      'SELECT id FROM system_settings WHERE setting_key = ?',
      [key]
    );
    
    if (existing.length > 0) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        code: RESPONSE_CODES.CONFLICT,
        message: '设置键名已存在'
      });
    }
    
    // 创建设置
    const [result] = await pool.execute(
      'INSERT INTO system_settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, ?, ?)',
      [key, String(value), group || 'general', description || null]
    );
    
    res.json({
      code: RESPONSE_CODES.SUCCESS,
      message: '创建设置成功',
      data: {
        id: result.insertId,
        key,
        value: String(value),
        group: group || 'general'
      }
    });
  } catch (error) {
    console.error('创建设置失败:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      code: RESPONSE_CODES.ERROR,
      message: '创建设置失败'
    });
  }
});

/**
 * 删除设置
 * DELETE /api/settings/:key
 */
router.delete('/:key', adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    
    const [result] = await pool.execute(
      'DELETE FROM system_settings WHERE setting_key = ?',
      [key]
    );
    
    if (result.affectedRows === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        code: RESPONSE_CODES.NOT_FOUND,
        message: '设置不存在'
      });
    }
    
    res.json({
      code: RESPONSE_CODES.SUCCESS,
      message: '删除设置成功'
    });
  } catch (error) {
    console.error('删除设置失败:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      code: RESPONSE_CODES.ERROR,
      message: '删除设置失败'
    });
  }
});

module.exports = router;
