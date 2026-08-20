/**
 * 角色权限管理
 */
const { ROLES, ROLE_LABELS, ROLE_TAG_CLASS } = require('./constants')

// 确保 roles 为数组
function _roles(userInfo) {
  const r = userInfo && userInfo.role
  if (Array.isArray(r)) return r
  if (typeof r === 'string') return r ? r.split(',') : []
  return []
}

function isAdmin(userInfo) {
  return _roles(userInfo).includes(ROLES.ADMIN)
}

function isWarehouseAdmin(userInfo) {
  const roles = _roles(userInfo)
  return roles.includes(ROLES.ADMIN) || roles.includes(ROLES.WAREHOUSE_ADMIN)
}

function isBorrower(userInfo) {
  return _roles(userInfo).includes(ROLES.BORROWER)
}

// ==================== 权限判断 ====================

function canManageUsers(userInfo) {
  return isWarehouseAdmin(userInfo)
}

function canApproveBorrow(userInfo) {
  return isWarehouseAdmin(userInfo)
}

function canConfirmCollect(userInfo) {
  return isWarehouseAdmin(userInfo)
}

function canConfirmReturn(userInfo) {
  return isWarehouseAdmin(userInfo)
}

function canManageItems(userInfo) {
  return isWarehouseAdmin(userInfo)
}

function canManageCategories(userInfo) {
  return isWarehouseAdmin(userInfo)
}

function cannotChangeAdminRole(targetUser) {
  return _roles(targetUser).includes(ROLES.ADMIN)
}

// ==================== 标签 ====================

function getRoleLabel(role) {
  const roles = Array.isArray(role) ? role : (role ? role.split(',') : [])
  return roles.map(r => ROLE_LABELS[r] || r).join('、') || '未知'
}

function getRoleTagClass(role) {
  const roles = Array.isArray(role) ? role : (role ? role.split(',') : [])
  if (roles.includes(ROLES.ADMIN)) return ROLE_TAG_CLASS[ROLES.ADMIN]
  if (roles.includes(ROLES.WAREHOUSE_ADMIN)) return ROLE_TAG_CLASS[ROLES.WAREHOUSE_ADMIN]
  if (roles.includes(ROLES.BORROWER)) return ROLE_TAG_CLASS[ROLES.BORROWER]
  return 'tag-gray'
}

/**
 * 判断用户是否已激活（有角色或 status 为 active）
 */
function isActive(userInfo) {
  if (!userInfo) return false
  return userInfo.status === 'active' || _roles(userInfo).length > 0
}

/**
 * 判断用户是否需要申请权限
 */
function needApplyRole(userInfo) {
  if (!userInfo) return false
  const roles = _roles(userInfo)
  const hasRole = roles.length > 0
  const admin = isWarehouseAdmin(userInfo)
  if (!hasRole && userInfo.status === 'pending' && !admin) return true
  if (!roles.includes(ROLES.BORROWER) && !admin && userInfo.status === 'pending_review') return true
  return false
}

/**
 * 判断用户是否可以借用
 */
function canBorrow(userInfo) {
  if (!userInfo) return false
  const roles = _roles(userInfo)
  return (roles.includes(ROLES.BORROWER) || isWarehouseAdmin(userInfo)) && isActive(userInfo)
}

module.exports = {
  ROLES,
  isAdmin,
  isWarehouseAdmin,
  isBorrower,
  canManageUsers,
  canApproveBorrow,
  canConfirmCollect,
  canConfirmReturn,
  canManageItems,
  canManageCategories,
  cannotChangeAdminRole,
  getRoleLabel,
  getRoleTagClass,
  isActive,
  needApplyRole,
  canBorrow
}
