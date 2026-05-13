const ROLES = {
  ADMIN: 'admin',
  WAREHOUSE_ADMIN: 'warehouse_admin',
  BORROWER: 'borrower'
}

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

function getRoleLabel(role) {
  // role 可能是数组或字符串
  const roles = Array.isArray(role) ? role : (role ? role.split(',') : [])
  const labels = {
    [ROLES.ADMIN]: '管理员',
    [ROLES.WAREHOUSE_ADMIN]: '仓库管理员',
    [ROLES.BORROWER]: '借用人员'
  }
  return roles.map(r => labels[r] || r).join('、') || '未知'
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
  getRoleLabel
}
