/**
 * 兼容层 — 所有函数已迁移到 services/ 目录
 * 新代码请直接使用 services/index.js
 * 旧代码暂时通过此文件兼容
 */
const { request } = require('./request')
const authService = require('../services/auth.service')
const userService = require('../services/user.service')
const itemService = require('../services/item.service')
const borrowService = require('../services/borrow.service')
const uploadService = require('../services/upload.service')

// 保留旧的 BASE_URL 引用（部分页面可能用到）
const config = require('./config')
const BASE_URL = config.BASE_URL

module.exports = {
  // 认证
  authLogin: authService.authLogin,

  // 用户
  login: userService.login,
  getUserList: userService.getUserList,
  updateUserRole: userService.updateUserRole,
  toggleUserStatus: userService.toggleUserStatus,
  applyRole: userService.applyRole,
  approveRole: userService.approveRole,
  updateProfile: userService.updateProfile,

  // 分类
  getCategoryList: itemService.getCategoryList,
  createCategory: itemService.createCategory,
  updateCategory: itemService.updateCategory,
  deleteCategory: itemService.deleteCategory,

  // 货物
  getItemList: itemService.getItemList,
  getItemDetail: itemService.getItemDetail,
  createItem: itemService.createItem,
  updateItem: itemService.updateItem,
  adjustInventory: itemService.adjustInventory,
  getInventoryLogs: itemService.getInventoryLogs,
  getItemBorrowers: itemService.getItemBorrowers,

  // 借用
  applyBorrow: borrowService.applyBorrow,
  getBorrowList: borrowService.getBorrowList,
  approveBorrow: borrowService.approveBorrow,
  rejectBorrow: borrowService.rejectBorrow,
  confirmCollect: borrowService.confirmCollect,
  confirmReturn: borrowService.confirmReturn,
  backfillBorrow: borrowService.backfillBorrow,

  // 上传
  uploadPhoto: uploadService.uploadPhoto,

  // 保留 request 引用
  request,
  BASE_URL
}
