/**
 * 用户服务
 */
const { request } = require('../utils/request')

const BASE = '/user'

/**
 * 登录 / 获取当前用户信息
 */
function login() {
  return request('POST', BASE, { action: 'login' })
}

/**
 * 获取用户列表
 */
function getUserList() {
  return request('POST', BASE, { action: 'getUserList' })
}

/**
 * 更新用户角色
 */
function updateUserRole(openid, role) {
  return request('POST', BASE, { action: 'updateUserRole', openid, role })
}

/**
 * 切换用户启用/禁用状态
 */
function toggleUserStatus(openid, status) {
  return request('POST', BASE, { action: 'toggleUserStatus', openid, status })
}

/**
 * 申请借用权限
 */
function applyRole(name) {
  return request('POST', BASE, { action: 'applyRole', name })
}

/**
 * 审批角色申请
 */
function approveRole(openid, approved, role) {
  return request('POST', BASE, { action: 'approveRole', openid, approved, role })
}

/**
 * 更新个人资料
 */
function updateProfile(name, avatarUrl) {
  return request('POST', BASE, { action: 'updateProfile', name, avatarUrl })
}

module.exports = {
  login,
  getUserList,
  updateUserRole,
  toggleUserStatus,
  applyRole,
  approveRole,
  updateProfile
}
