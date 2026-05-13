const cloud = wx.cloud

function callFunction(name, data = {}) {
  return cloud.callFunction({
    name,
    data
  }).then(res => {
    if (res.result && res.result.code === 0) {
      return res.result.data
    }
    return Promise.reject(res.result || { code: -1, message: '调用失败' })
  })
}

// 用户相关
function login() {
  return callFunction('userManage', { action: 'login' })
}

function getUserList() {
  return callFunction('userManage', { action: 'getUserList' })
}

function updateUserRole(openid, role) {
  return callFunction('userManage', { action: 'updateUserRole', openid, role })
}

function toggleUserStatus(openid, status) {
  return callFunction('userManage', { action: 'toggleUserStatus', openid, status })
}

// 货物类型相关
function getCategoryList() {
  return callFunction('itemManage', { action: 'getCategoryList' })
}

function createCategory(data) {
  return callFunction('itemManage', { action: 'createCategory', ...data })
}

function updateCategory(id, data) {
  return callFunction('itemManage', { action: 'updateCategory', id, ...data })
}

function deleteCategory(id) {
  return callFunction('itemManage', { action: 'deleteCategory', id })
}

// 货物相关
function getItemList(params = {}) {
  return callFunction('itemManage', { action: 'getItemList', ...params })
}

function getItemDetail(id) {
  return callFunction('itemManage', { action: 'getItemDetail', id })
}

function createItem(data) {
  return callFunction('itemManage', { action: 'createItem', ...data })
}

function updateItem(id, data) {
  return callFunction('itemManage', { action: 'updateItem', id, ...data })
}

function adjustInventory(data) {
  return callFunction('itemManage', { action: 'adjustInventory', ...data })
}

function getInventoryLogs(params = {}) {
  return callFunction('itemManage', { action: 'getInventoryLogs', ...params })
}

function getItemBorrowers(itemId) {
  return callFunction('itemManage', { action: 'getItemBorrowers', itemId })
}

// 借用相关
function applyBorrow(data) {
  return callFunction('borrowManage', { action: 'applyBorrow', ...data })
}

function getBorrowList(params = {}) {
  return callFunction('borrowManage', { action: 'getBorrowList', ...params })
}

function approveBorrow(id) {
  return callFunction('borrowManage', { action: 'approveBorrow', id })
}

function rejectBorrow(id, reason) {
  return callFunction('borrowManage', { action: 'rejectBorrow', id, reason })
}

function confirmCollect(id) {
  return callFunction('borrowManage', { action: 'confirmCollect', id })
}

function confirmReturn(id, photoUrl) {
  return callFunction('borrowManage', { action: 'confirmReturn', id, photoUrl })
}

function backfillBorrow(data) {
  return callFunction('borrowManage', { action: 'backfillBorrow', ...data })
}

// 照片上传
function uploadPhoto(filePath) {
  const cloudPath = `photos/${Date.now()}-${Math.random().toString(36).substr(2, 8)}.jpg`
  return cloud.uploadFile({
    cloudPath,
    filePath
  }).then(res => res.fileID)
}

module.exports = {
  login,
  getUserList,
  updateUserRole,
  toggleUserStatus,
  getCategoryList,
  createCategory,
  updateCategory,
  deleteCategory,
  getItemList,
  getItemDetail,
  createItem,
  updateItem,
  adjustInventory,
  getInventoryLogs,
  getItemBorrowers,
  applyBorrow,
  getBorrowList,
  approveBorrow,
  rejectBorrow,
  confirmCollect,
  confirmReturn,
  backfillBorrow,
  uploadPhoto
}
