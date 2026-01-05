<template>
  <div class="attachment-upload">
    <div class="upload-area" @click="!isUploading && triggerFileInput()"
      :class="{ 'drag-over': isDragOver, 'uploading': isUploading, 'has-file': attachmentData }"
      @dragover.prevent="!isUploading && (isDragOver = true)" @dragleave.prevent="isDragOver = false"
      @drop.prevent="!isUploading && handleFileDrop($event)">

      <input ref="fileInput" type="file" :accept="acceptedFileTypes" @change="handleFileSelect" style="display: none"
        :disabled="isUploading" />

      <!-- 已选择文件状态 -->
      <div v-if="attachmentData && !isUploading" class="file-success" @click="triggerFileInput()">
        <div class="file-icon">
          <SvgIcon name="attachment" width="24" height="24" />
        </div>
        <div class="file-info">
          <div class="file-name">{{ attachmentData.name }}</div>
          <div class="file-size">{{ formatFileSize(attachmentData.size) }}</div>
        </div>
        <button type="button" class="remove-btn" @click.stop="removeFile">
          <SvgIcon name="close" width="16" height="16" />
        </button>
      </div>

      <!-- 上传占位符 -->
      <div v-else-if="!isUploading" class="upload-placeholder">
        <SvgIcon name="attachment" class="upload-icon" width="32" height="32" />
        <p>添加附件</p>
        <p class="upload-hint">支持 ZIP、RAR、PDF、DOC 等格式</p>
        <p class="upload-hint">文件大小不超过{{ maxSizeMB }}MB</p>
        <p class="drag-hint">或拖拽文件到此处</p>
      </div>

      <!-- 上传进度 -->
      <div v-if="isUploading" class="upload-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div>
        </div>
        <p class="progress-text">{{ Math.floor(uploadProgress) }}%</p>
        <p v-if="uploadStatus" class="progress-status">{{ uploadStatus }}</p>
      </div>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <MessageToast v-if="showToast" :message="toastMessage" :type="toastType" @close="handleToastClose" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import SvgIcon from './SvgIcon.vue'
import MessageToast from './MessageToast.vue'

const props = defineProps({
  modelValue: {
    type: [String, Object],
    default: null
  },
  maxSize: {
    type: Number,
    default: 50 * 1024 * 1024 // 50MB
  },
  acceptedFileTypes: {
    type: String,
    default: '.zip,.rar,.7z,.tar,.gz,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'
  }
})

const emit = defineEmits(['update:modelValue', 'error', 'change'])

// 响应式数据
const fileInput = ref(null)
const attachmentData = ref(null)
const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref('')
const isDragOver = ref(false)
const error = ref('')
const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref('success')

// 计算显示的最大文件大小（MB）
const maxSizeMB = computed(() => {
  return Math.round(props.maxSize / (1024 * 1024))
})

// 监听外部值变化
watch(() => props.modelValue, (newValue) => {
  if (!newValue && attachmentData.value) {
    // 外部清空了值，重置组件
    attachmentData.value = null
    error.value = ''
  } else if (newValue && !attachmentData.value) {
    // 外部设置了值，可能是从外部加载的附件
    if (typeof newValue === 'object' && newValue.url) {
      attachmentData.value = {
        url: newValue.url,
        name: newValue.name || '附件',
        size: newValue.size || 0,
        uploaded: true
      }
    }
  }
})

// 触发文件选择
const triggerFileInput = () => {
  if (fileInput.value) {
    fileInput.value.click()
  }
}

// 处理文件选择
const handleFileSelect = (event) => {
  const files = event.target.files
  if (files && files.length > 0) {
    handleFile(files[0])
  }
}

// 处理文件拖拽
const handleFileDrop = (event) => {
  isDragOver.value = false
  const files = event.dataTransfer.files
  if (files && files.length > 0) {
    handleFile(files[0])
  }
}

// 验证文件
const validateFile = (file) => {
  // 验证文件大小
  if (file.size > props.maxSize) {
    return { valid: false, message: `文件大小不能超过${formatFileSize(props.maxSize)}` }
  }

  return { valid: true }
}

// 处理文件
const handleFile = async (file) => {
  if (!file) return

  // 验证文件
  const validation = validateFile(file)
  if (!validation.valid) {
    error.value = validation.message
    emit('error', validation.message)
    return
  }

  attachmentData.value = {
    file: file,
    name: file.name,
    size: file.size,
    uploaded: false,
    url: null
  }

  error.value = ''

  // 传递文件名作为modelValue
  emit('update:modelValue', file.name)
  emit('change', { type: 'attachment', hasChanges: true })
}

// 移除文件
const removeFile = () => {
  attachmentData.value = null
  error.value = ''
  uploadProgress.value = 0
  emit('update:modelValue', null)

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 上传文件
const startUpload = async () => {
  if (!attachmentData.value || !attachmentData.value.file) {
    return { success: false, message: '没有附件文件' }
  }

  isUploading.value = true
  uploadProgress.value = 0
  uploadStatus.value = '准备上传...'

  try {
    const formData = new FormData()
    formData.append('file', attachmentData.value.file)

    const token = localStorage.getItem('token') || localStorage.getItem('admin_token')
    if (!token) {
      throw new Error('未登录，请先登录')
    }

    // 使用XMLHttpRequest来获取上传进度
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100)
          uploadProgress.value = percent
          uploadStatus.value = `上传中 ${percent}%`
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText)
            resolve(response)
          } catch (e) {
            reject(new Error('解析响应失败'))
          }
        } else {
          reject(new Error(`上传失败: HTTP ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('网络错误'))
      })

      xhr.open('POST', '/api/upload/attachment')
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.send(formData)
    })

    if (result.code === 200) {
      isUploading.value = false
      uploadStatus.value = ''
      if (attachmentData.value) {
        attachmentData.value.uploaded = true
        attachmentData.value.url = result.data.url

        emit('update:modelValue', {
          url: result.data.url,
          name: attachmentData.value.name,
          size: attachmentData.value.size
        })
        showMessage('附件上传成功', 'success')
        return { success: true, data: result.data }
      }
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    console.error('附件上传失败:', err)
    isUploading.value = false
    uploadStatus.value = ''
    error.value = '附件上传失败，请重试'
    emit('error', error.value)
    showMessage(error.value, 'error')
    return { success: false, message: err.message || '上传失败' }
  }
}

// 显示消息提示
const showMessage = (message, type = 'success') => {
  toastMessage.value = message
  toastType.value = type
  showToast.value = true
}

// 关闭消息提示
const handleToastClose = () => {
  showToast.value = false
}

// 获取附件数据
const getAttachmentData = () => {
  return attachmentData.value
}

// 重置组件
const reset = () => {
  removeFile()
}

// 暴露方法给父组件
defineExpose({
  getAttachmentData,
  reset,
  removeFile,
  startUpload
})
</script>

<style scoped>
.attachment-upload {
  width: 100%;
}

.upload-area {
  width: 100%;
  min-height: 120px;
  border: 2px dashed var(--border-color-primary);
  border-radius: 8px;
  background: var(--bg-color-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.upload-area:hover {
  border-color: var(--primary-color);
  background: var(--bg-color-secondary);
}

.upload-area.drag-over {
  border-color: var(--primary-color);
  background: var(--bg-color-secondary);
  transform: scale(1.02);
}

.upload-area.has-file {
  min-height: 80px;
  cursor: default;
  border-style: solid;
}

.file-success {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 16px;
  gap: 12px;
}

.file-icon {
  width: 48px;
  height: 48px;
  background: var(--bg-color-secondary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  overflow: hidden;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 2px;
}

.remove-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: var(--bg-color-tertiary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-color-secondary);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.remove-btn:hover {
  background: var(--danger-color);
  color: white;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-color-secondary);
  padding: 20px;
}

.upload-placeholder .upload-icon {
  margin-bottom: 8px;
  color: var(--text-color-tertiary);
}

.upload-placeholder p {
  margin: 4px 0;
  font-size: 14px;
}

.upload-hint {
  font-size: 12px !important;
  color: var(--text-color-tertiary);
}

.drag-hint {
  font-size: 12px !important;
  color: var(--text-color-quaternary);
  margin-top: 8px !important;
}

.upload-progress {
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
  text-align: center;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: var(--bg-color-tertiary);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color), var(--success-color));
  transition: width 0.3s ease;
  border-radius: 3px;
}

.progress-text {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin: 0;
}

.progress-status {
  font-size: 11px;
  color: var(--text-color-tertiary);
  margin: 4px 0 0 0;
}

.error-message {
  color: var(--danger-color);
  font-size: 12px;
  margin-top: 8px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .upload-area {
    min-height: 100px;
  }

  .upload-area.has-file {
    min-height: 70px;
  }
}
</style>
