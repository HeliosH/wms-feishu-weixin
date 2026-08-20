/**
 * 全局常量定义
 * 统一管理状态、角色、变更类型等枚举值
 */

// 借用状态
const BORROW_STATUS = {
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COLLECTED: 'collected',
  RETURNED: 'returned'
}

// 用户状态
const USER_STATUS = {
  PENDING: 'pending',
  PENDING_REVIEW: 'pending_review',
  ACTIVE: 'active',
  INACTIVE: 'inactive'
}

// 角色
const ROLES = {
  ADMIN: 'admin',
  WAREHOUSE_ADMIN: 'warehouse_admin',
  BORROWER: 'borrower'
}

// 库存变更类型
const CHANGE_TYPE = {
  STOCK_IN: 'stock_in',
  STOCK_OUT: 'stock_out',
  ADJUST: 'adjust',
  BORROW: 'borrow',
  RETURN: 'return'
}

// 货物状态
const ITEM_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
}

// 借用状态标签映射
const BORROW_STATUS_LABELS = {
  [BORROW_STATUS.PENDING_APPROVAL]: '待审批',
  [BORROW_STATUS.APPROVED]: '已通过',
  [BORROW_STATUS.REJECTED]: '已驳回',
  [BORROW_STATUS.COLLECTED]: '已领取',
  [BORROW_STATUS.RETURNED]: '已归还'
}

// 借用状态 tag class 映射
const BORROW_STATUS_TAG_CLASS = {
  [BORROW_STATUS.PENDING_APPROVAL]: 'tag-orange',
  [BORROW_STATUS.APPROVED]: 'tag-blue',
  [BORROW_STATUS.REJECTED]: 'tag-red',
  [BORROW_STATUS.COLLECTED]: 'tag-green',
  [BORROW_STATUS.RETURNED]: 'tag-gray'
}

// 借用状态文字颜色 class 映射
const BORROW_STATUS_TEXT_CLASS = {
  [BORROW_STATUS.PENDING_APPROVAL]: 'status-pending',
  [BORROW_STATUS.APPROVED]: 'status-approved',
  [BORROW_STATUS.REJECTED]: 'status-rejected',
  [BORROW_STATUS.COLLECTED]: 'status-collected',
  [BORROW_STATUS.RETURNED]: 'status-returned'
}

// 库存变更类型标签映射
const CHANGE_TYPE_LABELS = {
  [CHANGE_TYPE.STOCK_IN]: '入库',
  [CHANGE_TYPE.STOCK_OUT]: '出库',
  [CHANGE_TYPE.ADJUST]: '盘点调整',
  [CHANGE_TYPE.BORROW]: '借出',
  [CHANGE_TYPE.RETURN]: '归还'
}

// 库存变更类型 tag class 映射
const CHANGE_TYPE_TAG_CLASS = {
  [CHANGE_TYPE.STOCK_IN]: 'tag-green',
  [CHANGE_TYPE.STOCK_OUT]: 'tag-red',
  [CHANGE_TYPE.ADJUST]: 'tag-orange',
  [CHANGE_TYPE.BORROW]: 'tag-blue',
  [CHANGE_TYPE.RETURN]: 'tag-gray'
}

// 角色标签映射
const ROLE_LABELS = {
  [ROLES.ADMIN]: '管理员',
  [ROLES.WAREHOUSE_ADMIN]: '仓库管理员',
  [ROLES.BORROWER]: '借用人员'
}

// 角色 tag class 映射
const ROLE_TAG_CLASS = {
  [ROLES.ADMIN]: 'tag-red',
  [ROLES.WAREHOUSE_ADMIN]: 'tag-blue',
  [ROLES.BORROWER]: 'tag-green'
}

// 用户状态标签映射
const USER_STATUS_LABELS = {
  [USER_STATUS.PENDING]: '待激活',
  [USER_STATUS.PENDING_REVIEW]: '待审核',
  [USER_STATUS.ACTIVE]: '正常',
  [USER_STATUS.INACTIVE]: '已禁用'
}

module.exports = {
  BORROW_STATUS,
  USER_STATUS,
  ROLES,
  CHANGE_TYPE,
  ITEM_STATUS,
  BORROW_STATUS_LABELS,
  BORROW_STATUS_TAG_CLASS,
  BORROW_STATUS_TEXT_CLASS,
  CHANGE_TYPE_LABELS,
  CHANGE_TYPE_TAG_CLASS,
  ROLE_LABELS,
  ROLE_TAG_CLASS,
  USER_STATUS_LABELS
}
