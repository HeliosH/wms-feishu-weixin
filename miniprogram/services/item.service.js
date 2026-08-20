/**
 * 货物与分类服务
 */
const { request } = require('../utils/request')

const BASE = '/item'

// ==================== 分类 ====================

function getCategoryList() {
  return request('POST', BASE, { action: 'getCategoryList' })
}

function createCategory(data) {
  return request('POST', BASE, { action: 'createCategory', ...data })
}

function updateCategory(id, data) {
  return request('POST', BASE, { action: 'updateCategory', recordId: id, ...data })
}

function deleteCategory(id) {
  return request('POST', BASE, { action: 'deleteCategory', recordId: id })
}

// ==================== 货物 ====================

function getItemList(params) {
  return request('POST', BASE, { action: 'getItemList', ...params })
}

function getItemDetail(id) {
  return request('POST', BASE, { action: 'getItemDetail', id })
}

function createItem(data) {
  return request('POST', BASE, { action: 'createItem', ...data })
}

function updateItem(id, data) {
  return request('POST', BASE, { action: 'updateItem', recordId: id, ...data })
}

// ==================== 库存 ====================

function adjustInventory(data) {
  return request('POST', BASE, { action: 'adjustInventory', ...data })
}

function getInventoryLogs(params) {
  return request('POST', BASE, { action: 'getInventoryLogs', ...params })
}

function getItemBorrowers(itemId) {
  return request('POST', BASE, { action: 'getItemBorrowers', itemId })
}

module.exports = {
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
  getItemBorrowers
}
