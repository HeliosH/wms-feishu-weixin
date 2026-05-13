function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const pad = n => n < 10 ? '0' + n : '' + n
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const diff = now - new Date(dateStr).getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return Math.floor(diff / minute) + '分钟前'
  if (diff < day) return Math.floor(diff / hour) + '小时前'
  if (diff < 30 * day) return Math.floor(diff / day) + '天前'
  return formatDate(dateStr)
}

function getStatusLabel(status) {
  const labels = {
    pending_approval: '待审批',
    approved: '已通过',
    rejected: '已驳回',
    collected: '已领取',
    returned: '已归还'
  }
  return labels[status] || status
}

function getStatusClass(status) {
  const classes = {
    pending_approval: 'status-pending',
    approved: 'status-approved',
    rejected: 'status-rejected',
    collected: 'status-collected',
    returned: 'status-returned'
  }
  return classes[status] || ''
}

function getStatusTagClass(status) {
  const classes = {
    pending_approval: 'tag-orange',
    approved: 'tag-blue',
    rejected: 'tag-red',
    collected: 'tag-green',
    returned: 'tag-gray'
  }
  return classes[status] || 'tag-gray'
}

function getChangeTypeLabel(type) {
  const labels = {
    stock_in: '入库',
    stock_out: '出库',
    adjust: '盘点调整',
    borrow: '借出',
    return: '归还'
  }
  return labels[type] || type
}

function showToast(title, icon = 'none') {
  wx.showToast({ title, icon, duration: 2000 })
}

function showLoading(title = '加载中') {
  wx.showLoading({ title, mask: true })
}

function hideLoading() {
  wx.hideLoading()
}

module.exports = {
  formatDate,
  formatRelativeTime,
  getStatusLabel,
  getStatusClass,
  getStatusTagClass,
  getChangeTypeLabel,
  showToast,
  showLoading,
  hideLoading
}
