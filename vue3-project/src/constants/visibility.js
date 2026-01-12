/**
 * 可见性常量和选项
 */

// 可见性值常量
export const VISIBILITY = {
  PUBLIC: 0,           // 公开
  PRIVATE: 1,          // 私密
  MUTUAL_FRIENDS: 2    // 仅互关好友可见
}

// 可见性选项（用于下拉选择器）
export const VISIBILITY_OPTIONS = [
  { value: VISIBILITY.PUBLIC, label: '公开' },
  { value: VISIBILITY.PRIVATE, label: '私密' },
  { value: VISIBILITY.MUTUAL_FRIENDS, label: '仅互关好友可见' }
]

// 获取可见性标签
export function getVisibilityLabel(value) {
  const option = VISIBILITY_OPTIONS.find(opt => opt.value === value)
  return option ? option.label : '未知'
}
