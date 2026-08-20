/**
 * 通用工具函数
 */
const {
  BORROW_STATUS_LABELS,
  BORROW_STATUS_TAG_CLASS,
  BORROW_STATUS_TEXT_CLASS,
  CHANGE_TYPE_LABELS,
  CHANGE_TYPE_TAG_CLASS
} = require('./constants')
const { SERVER_URL } = require('./config')

// ==================== 静态资源地址 ====================

/**
 * 解析服务端返回的文件相对路径为完整 URL
 * 数据库存相对路径（/uploads/...），渲染时拼上服务器地址
 */
function resolveFileUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url // 已是完整地址
  if (url.startsWith('/')) return SERVER_URL + url
  return url
}

// ==================== 日期格式化 ====================

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const pad = n => n < 10 ? '0' + n : '' + n
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const diff = now - new Date(dateStr).getTime()
  if (isNaN(diff)) return ''
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < 0) return formatDate(dateStr)
  if (diff < minute) return '刚刚'
  if (diff < hour) return Math.floor(diff / minute) + '分钟前'
  if (diff < day) return Math.floor(diff / hour) + '小时前'
  if (diff < 30 * day) return Math.floor(diff / day) + '天前'
  return formatDate(dateStr)
}

// ==================== 状态映射 ====================

function getStatusLabel(status) {
  return BORROW_STATUS_LABELS[status] || status
}

function getStatusClass(status) {
  return BORROW_STATUS_TEXT_CLASS[status] || ''
}

function getStatusTagClass(status) {
  return BORROW_STATUS_TAG_CLASS[status] || 'tag-gray'
}

function getChangeTypeLabel(type) {
  return CHANGE_TYPE_LABELS[type] || type
}

function getChangeTypeTagClass(type) {
  return CHANGE_TYPE_TAG_CLASS[type] || 'tag-gray'
}

// ==================== UI 辅助 ====================

function showToast(title, icon = 'none') {
  wx.showToast({ title, icon, duration: 2000 })
}

function showLoading(title = '加载中') {
  wx.showLoading({ title, mask: true })
}

function hideLoading() {
  wx.hideLoading()
}

/**
 * 确认弹窗 Promise 封装
 */
function confirm(title, content) {
  return new Promise((resolve) => {
    wx.showModal({
      title: title || '提示',
      content: content || '',
      success(res) {
        resolve(res.confirm)
      }
    })
  })
}

/**
 * 输入弹窗 Promise 封装
 */
function prompt(title, placeholder) {
  return new Promise((resolve) => {
    wx.showModal({
      title: title || '请输入',
      editable: true,
      placeholderText: placeholder || '',
      success(res) {
        if (res.confirm) {
          resolve(res.content || '')
        } else {
          resolve(null)
        }
      }
    })
  })
}

module.exports = {
  formatDate,
  formatRelativeTime,
  resolveFileUrl,
  getStatusLabel,
  getStatusClass,
  getStatusTagClass,
  getChangeTypeLabel,
  getChangeTypeTagClass,
  showToast,
  showLoading,
  hideLoading,
  confirm,
  prompt
}
