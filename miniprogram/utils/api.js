const auth = require('./auth')

// 线上环境替换为真实域名，本地开发用局域网IP
const BASE_URL = 'http://localhost:3000/api'

function request(method, url, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      method,
      url: BASE_URL + url,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth.getToken()
      },
      success(res) {
        if (res.data.code === 0) {
          resolve(res.data.data)
        } else {
          reject(res.data)
        }
      },
      fail: reject
    })
  })
}

// 登录认证
function authLogin(code) {
  return request('POST', '/auth/login', { code })
}

// 用户相关
function login() {
  return request('POST', '/user', { action: 'login' })
}

function getUserList() {
  return request('POST', '/user', { action: 'getUserList' })
}

function updateUserRole(openid, role) {
  return request('POST', '/user', { action: 'updateUserRole', openid, role })
}

function toggleUserStatus(openid, status) {
  return request('POST', '/user', { action: 'toggleUserStatus', openid, status })
}

function applyRole(name) {
  return request('POST', '/user', { action: 'applyRole', name })
}

function approveRole(openid, approved, role) {
  return request('POST', '/user', { action: 'approveRole', openid, approved, role })
}

// 货物类型相关
function getCategoryList() {
  return request('POST', '/item', { action: 'getCategoryList' })
}

function createCategory(data) {
  return request('POST', '/item', { action: 'createCategory', ...data })
}

function updateCategory(id, data) {
  return request('POST', '/item', { action: 'updateCategory', recordId: id, ...data })
}

function deleteCategory(id) {
  return request('POST', '/item', { action: 'deleteCategory', recordId: id })
}

// 货物相关
function getItemList(params) {
  return request('POST', '/item', { action: 'getItemList', ...params })
}

function getItemDetail(id) {
  return request('POST', '/item', { action: 'getItemDetail', id })
}

function createItem(data) {
  return request('POST', '/item', { action: 'createItem', ...data })
}

function updateItem(id, data) {
  return request('POST', '/item', { action: 'updateItem', recordId: id, ...data })
}

function adjustInventory(data) {
  return request('POST', '/item', { action: 'adjustInventory', ...data })
}

function getInventoryLogs(params) {
  return request('POST', '/item', { action: 'getInventoryLogs', ...params })
}

function getItemBorrowers(itemId) {
  return request('POST', '/item', { action: 'getItemBorrowers', itemId })
}

// 借用相关
function applyBorrow(data) {
  return request('POST', '/borrow', { action: 'applyBorrow', ...data })
}

function getBorrowList(params) {
  return request('POST', '/borrow', { action: 'getBorrowList', ...params })
}

function approveBorrow(id) {
  return request('POST', '/borrow', { action: 'approveBorrow', id })
}

function rejectBorrow(id, reason) {
  return request('POST', '/borrow', { action: 'rejectBorrow', id, reason })
}

function confirmCollect(id) {
  return request('POST', '/borrow', { action: 'confirmCollect', id })
}

function confirmReturn(id, photoUrl) {
  return request('POST', '/borrow', { action: 'confirmReturn', id, photoUrl })
}

function backfillBorrow(data) {
  return request('POST', '/borrow', { action: 'backfillBorrow', ...data })
}

// 照片上传
function uploadPhoto(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE_URL + '/upload',
      filePath,
      name: 'photo',
      header: {
        'Authorization': 'Bearer ' + auth.getToken()
      },
      success(res) {
        try {
          const data = JSON.parse(res.data)
          if (data.code === 0) resolve(data.data.url)
          else reject(data)
        } catch (e) {
          reject(res)
        }
      },
      fail: reject
    })
  })
}

module.exports = {
  authLogin,
  login,
  getUserList,
  updateUserRole,
  toggleUserStatus,
  applyRole,
  approveRole,
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
