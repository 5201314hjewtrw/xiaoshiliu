<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="attachment-modal-overlay" @click.self="handleClose">
        <div class="attachment-modal">
          <div class="modal-header">
            <h3>上传附件</h3>
            <button class="close-btn" @click="handleClose">
              <SvgIcon name="close" width="20" height="20" />
            </button>
          </div>
          
          <div class="modal-body">
            <AttachmentUpload
              ref="attachmentUploadRef"
              v-model="attachmentValue"
              :max-size="maxSize"
              @change="handleChange"
              @error="handleError"
            />
          </div>
          
          <div class="modal-footer">
            <button class="cancel-btn" @click="handleClose">取消</button>
            <button class="confirm-btn" :disabled="!hasAttachment || isUploading" @click="handleConfirm">
              {{ isUploading ? '上传中...' : '确定' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import SvgIcon from './SvgIcon.vue'
import AttachmentUpload from './AttachmentUpload.vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  maxSize: {
    type: Number,
    default: 50 * 1024 * 1024 // 50MB
  },
  modelValue: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'confirm', 'close', 'update:modelValue'])

const attachmentUploadRef = ref(null)
const attachmentValue = ref(null)
const isUploading = ref(false)

const hasAttachment = computed(() => {
  return attachmentValue.value !== null
})

watch(() => props.visible, (newValue) => {
  if (newValue && props.modelValue) {
    attachmentValue.value = props.modelValue
  }
})

const handleClose = () => {
  emit('update:visible', false)
  emit('close')
}

const handleChange = (data) => {
  // 附件变更事件
}

const handleError = (error) => {
  console.error('附件上传错误:', error)
}

const handleConfirm = async () => {
  if (!attachmentUploadRef.value) return
  
  const attachmentData = attachmentUploadRef.value.getAttachmentData()
  
  if (!attachmentData) {
    return
  }
  
  // 如果附件已上传，直接返回
  if (attachmentData.uploaded && attachmentData.url) {
    emit('update:modelValue', {
      url: attachmentData.url,
      name: attachmentData.name,
      size: attachmentData.size
    })
    emit('confirm', attachmentData)
    handleClose()
    return
  }
  
  // 如果有文件但未上传，开始上传
  if (attachmentData.file) {
    isUploading.value = true
    try {
      const result = await attachmentUploadRef.value.startUpload()
      if (result.success) {
        emit('update:modelValue', {
          url: result.data.url,
          name: attachmentData.name,
          size: attachmentData.size
        })
        emit('confirm', {
          ...attachmentData,
          url: result.data.url,
          uploaded: true
        })
        handleClose()
      }
    } catch (error) {
      console.error('附件上传失败:', error)
    } finally {
      isUploading.value = false
    }
  }
}

// 暴露方法
defineExpose({
  reset: () => {
    attachmentValue.value = null
    if (attachmentUploadRef.value) {
      attachmentUploadRef.value.reset()
    }
  }
})
</script>

<style scoped>
.attachment-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.attachment-modal {
  width: 90%;
  max-width: 480px;
  background: var(--bg-color-primary);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color-primary);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-color-secondary);
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--bg-color-secondary);
  color: var(--text-color-primary);
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color-primary);
}

.cancel-btn,
.confirm-btn {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn {
  background: var(--bg-color-secondary);
  color: var(--text-color-primary);
  border: 1px solid var(--border-color-primary);
}

.cancel-btn:hover {
  background: var(--bg-color-tertiary);
}

.confirm-btn {
  background: var(--primary-color);
  color: white;
  border: none;
}

.confirm-btn:hover:not(:disabled) {
  background: var(--primary-color-dark);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .attachment-modal,
.modal-leave-to .attachment-modal {
  transform: scale(0.9);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .attachment-modal {
    width: 95%;
    max-width: none;
    margin: 20px;
  }
}
</style>
