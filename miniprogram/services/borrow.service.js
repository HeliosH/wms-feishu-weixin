/**
 * 借用服务
 */
const { request } = require('../utils/request')

const BASE = '/borrow'

/**
 * 申请借用
 */
function applyBorrow(data) {
  return request('POST', BASE, { action: 'applyBorrow', ...data })
}

/**
 * 获取借用列表
 * @param {object} params - { status, borrowerId, itemId }
 */
function getBorrowList(params) {
  return request('POST', BASE, { action: 'getBorrowList', ...params })
}

/**
 * 审批通过
 */
function approveBorrow(id) {
  return request('POST', BASE, { action: 'approveBorrow', id })
}

/**
 * 驳回
 */
function rejectBorrow(id, reason) {
  return request('POST', BASE, { action: 'rejectBorrow', id, reason })
}

/**
 * 确认领取
 */
function confirmCollect(id) {
  return request('POST', BASE, { action: 'confirmCollect', id })
}

/**
 * 确认归还
 */
function confirmReturn(id, photoUrl) {
  return request('POST', BASE, { action: 'confirmReturn', id, photoUrl })
}

/**
 * 补录借用记录
 */
function backfillBorrow(data) {
  return request('POST', BASE, { action: 'backfillBorrow', ...data })
}

module.exports = {
  applyBorrow,
  getBorrowList,
  approveBorrow,
  rejectBorrow,
  confirmCollect,
  confirmReturn,
  backfillBorrow
}
