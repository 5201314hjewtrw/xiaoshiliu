<template>
  <div class="system-settings">
    <div class="settings-container">
      <!-- 视频转码设置卡片 -->
      <div class="settings-card">
        <div class="card-header">
          <div class="card-title">
            <SvgIcon name="video" class="title-icon" />
            <span>视频转码设置</span>
          </div>
          <div class="ffmpeg-status" :class="{ available: ffmpegAvailable }">
            <SvgIcon :name="ffmpegAvailable ? 'tick' : 'close'" class="status-icon" />
            <span>FFmpeg {{ ffmpegAvailable ? '可用' : '不可用' }}</span>
          </div>
        </div>

        <div class="card-body">
          <!-- 转码开关 -->
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">启用视频转码</div>
              <div class="setting-description">
                开启后，上传的视频将自动转码为DASH格式，支持自适应码率播放
              </div>
            </div>
            <div class="setting-control">
              <label class="switch">
                <input 
                  type="checkbox" 
                  v-model="settings.video_transcode_enabled"
                  @change="handleSettingChange('video_transcode_enabled', settings.video_transcode_enabled)"
                  :disabled="!ffmpegAvailable"
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <!-- 码率设置 -->
          <div class="setting-item" :class="{ disabled: !settings.video_transcode_enabled }">
            <div class="setting-info">
              <div class="setting-label">最小码率 (kbps)</div>
              <div class="setting-description">
                视频转码的最低码率，用于低带宽网络环境
              </div>
            </div>
            <div class="setting-control">
              <input 
                type="number" 
                class="input-field"
                v-model.number="settings.video_transcode_min_bitrate"
                :disabled="!settings.video_transcode_enabled"
                min="100"
                max="10000"
                step="100"
                @change="handleSettingChange('video_transcode_min_bitrate', settings.video_transcode_min_bitrate)"
              />
            </div>
          </div>

          <div class="setting-item" :class="{ disabled: !settings.video_transcode_enabled }">
            <div class="setting-info">
              <div class="setting-label">最大码率 (kbps)</div>
              <div class="setting-description">
                视频转码的最高码率，用于高带宽网络环境
              </div>
            </div>
            <div class="setting-control">
              <input 
                type="number" 
                class="input-field"
                v-model.number="settings.video_transcode_max_bitrate"
                :disabled="!settings.video_transcode_enabled"
                min="500"
                max="20000"
                step="100"
                @change="handleSettingChange('video_transcode_max_bitrate', settings.video_transcode_max_bitrate)"
              />
            </div>
          </div>

          <!-- 转码格式 -->
          <div class="setting-item" :class="{ disabled: !settings.video_transcode_enabled }">
            <div class="setting-info">
              <div class="setting-label">转码格式</div>
              <div class="setting-description">
                选择视频流媒体格式
              </div>
            </div>
            <div class="setting-control">
              <select 
                class="select-field"
                v-model="settings.video_transcode_format"
                :disabled="!settings.video_transcode_enabled"
                @change="handleSettingChange('video_transcode_format', settings.video_transcode_format)"
              >
                <option value="dash">DASH (推荐)</option>
                <option value="hls">HLS</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 码率预览 -->
        <div class="bitrate-preview" v-if="settings.video_transcode_enabled">
          <div class="preview-title">质量等级预览</div>
          <div class="quality-levels">
            <div class="quality-item" v-for="quality in qualityLevels" :key="quality.label">
              <span class="quality-label">{{ quality.label }}</span>
              <span class="quality-bitrate">{{ quality.bitrate }} kbps</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 保存按钮 -->
      <div class="actions">
        <button class="save-btn" @click="saveAllSettings" :disabled="!hasChanges || saving">
          <SvgIcon v-if="saving" name="loading" class="loading-icon" />
          <span>{{ saving ? '保存中...' : '保存设置' }}</span>
        </button>
      </div>
    </div>

    <MessageToast v-if="showToast" :message="toastMessage" :type="toastType" @close="showToast = false" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import SvgIcon from '@/components/SvgIcon.vue'
import MessageToast from '@/components/MessageToast.vue'
import { settingsApi } from '@/api/settings.js'

// 响应式数据
const settings = reactive({
  video_transcode_enabled: false,
  video_transcode_min_bitrate: 500,
  video_transcode_max_bitrate: 2500,
  video_transcode_format: 'dash'
})

const originalSettings = ref({})
const ffmpegAvailable = ref(false)
const loading = ref(true)
const saving = ref(false)
const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref('success')

// 计算是否有未保存的更改
const hasChanges = computed(() => {
  return JSON.stringify(settings) !== JSON.stringify(originalSettings.value)
})

// 计算质量等级预览
const qualityLevels = computed(() => {
  const min = settings.video_transcode_min_bitrate || 500
  const max = settings.video_transcode_max_bitrate || 2500
  
  const levels = [
    { label: '360p', height: 360 },
    { label: '480p', height: 480 },
    { label: '720p', height: 720 },
    { label: '1080p', height: 1080 }
  ]
  
  const step = (max - min) / (levels.length - 1)
  
  return levels.map((level, index) => ({
    ...level,
    bitrate: Math.round(min + step * index)
  }))
})

// 初始化加载设置
onMounted(async () => {
  await loadSettings()
})

// 加载设置
async function loadSettings() {
  loading.value = true
  try {
    const result = await settingsApi.getVideoStatus()
    
    if (result.success) {
      const videoSettings = result.data.settings || {}
      
      settings.video_transcode_enabled = videoSettings.video_transcode_enabled === 'true'
      settings.video_transcode_min_bitrate = parseInt(videoSettings.video_transcode_min_bitrate) || 500
      settings.video_transcode_max_bitrate = parseInt(videoSettings.video_transcode_max_bitrate) || 2500
      settings.video_transcode_format = videoSettings.video_transcode_format || 'dash'
      
      ffmpegAvailable.value = result.data.ffmpegAvailable || false
      
      // 保存原始设置
      originalSettings.value = { ...settings }
    } else {
      showMessage(result.message || '加载设置失败', 'error')
    }
  } catch (error) {
    console.error('加载设置失败:', error)
    showMessage('加载设置失败', 'error')
  } finally {
    loading.value = false
  }
}

// 处理单个设置变更
function handleSettingChange(key, value) {
  // 验证码率设置
  if (key === 'video_transcode_min_bitrate') {
    if (value >= settings.video_transcode_max_bitrate) {
      settings.video_transcode_min_bitrate = settings.video_transcode_max_bitrate - 100
      showMessage('最小码率必须小于最大码率', 'warning')
    }
  }
  
  if (key === 'video_transcode_max_bitrate') {
    if (value <= settings.video_transcode_min_bitrate) {
      settings.video_transcode_max_bitrate = settings.video_transcode_min_bitrate + 100
      showMessage('最大码率必须大于最小码率', 'warning')
    }
  }
}

// 保存所有设置
async function saveAllSettings() {
  saving.value = true
  
  try {
    const settingsToSave = {
      video_transcode_enabled: String(settings.video_transcode_enabled),
      video_transcode_min_bitrate: String(settings.video_transcode_min_bitrate),
      video_transcode_max_bitrate: String(settings.video_transcode_max_bitrate),
      video_transcode_format: settings.video_transcode_format
    }
    
    const result = await settingsApi.updateSettings(settingsToSave)
    
    if (result.success) {
      originalSettings.value = { ...settings }
      showMessage('设置保存成功', 'success')
    } else {
      showMessage(result.message || '保存设置失败', 'error')
    }
  } catch (error) {
    console.error('保存设置失败:', error)
    showMessage('保存设置失败', 'error')
  } finally {
    saving.value = false
  }
}

// 显示消息
function showMessage(message, type = 'success') {
  toastMessage.value = message
  toastType.value = type
  showToast.value = true
}
</script>

<style scoped>
.system-settings {
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
}

.settings-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-card {
  background: var(--bg-color-primary);
  border-radius: 12px;
  border: 1px solid var(--border-color-primary);
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color-primary);
  background: var(--bg-color-secondary);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.title-icon {
  width: 24px;
  height: 24px;
  color: var(--primary-color);
}

.ffmpeg-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  background: var(--danger-bg);
  color: var(--danger-color);
}

.ffmpeg-status.available {
  background: var(--success-bg);
  color: var(--success-color);
}

.status-icon {
  width: 14px;
  height: 14px;
}

.card-body {
  padding: 24px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color-secondary);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-item.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.setting-info {
  flex: 1;
  margin-right: 24px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color-primary);
  margin-bottom: 4px;
}

.setting-description {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.setting-control {
  flex-shrink: 0;
}

/* Switch 开关样式 */
.switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--border-color-primary);
  transition: 0.3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: var(--primary-color);
}

input:checked + .slider:before {
  transform: translateX(24px);
}

input:disabled + .slider {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 输入框样式 */
.input-field {
  width: 120px;
  padding: 8px 12px;
  border: 1px solid var(--border-color-primary);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-color-primary);
  background: var(--bg-color-primary);
  transition: border-color 0.3s;
}

.input-field:focus {
  outline: none;
  border-color: var(--primary-color);
}

.input-field:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 选择框样式 */
.select-field {
  width: 140px;
  padding: 8px 12px;
  border: 1px solid var(--border-color-primary);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-color-primary);
  background: var(--bg-color-primary);
  cursor: pointer;
  transition: border-color 0.3s;
}

.select-field:focus {
  outline: none;
  border-color: var(--primary-color);
}

.select-field:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 码率预览 */
.bitrate-preview {
  padding: 16px 24px 24px;
  background: var(--bg-color-secondary);
  border-top: 1px solid var(--border-color-primary);
}

.preview-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary);
  margin-bottom: 12px;
}

.quality-levels {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.quality-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-color-primary);
  border-radius: 8px;
  border: 1px solid var(--border-color-primary);
  min-width: 80px;
}

.quality-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.quality-bitrate {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}

/* 保存按钮 */
.actions {
  display: flex;
  justify-content: flex-end;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.3s;
}

.save-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-icon {
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 响应式 */
@media (max-width: 768px) {
  .system-settings {
    padding: 16px;
  }

  .setting-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .setting-info {
    margin-right: 0;
  }

  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .quality-levels {
    justify-content: center;
  }
}
</style>
