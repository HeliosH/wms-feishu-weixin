const cloud = require('wx-server-sdk')
const axios = require('axios')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

let localConfig = { feishu: {} }
try { localConfig = require('./config.json') } catch (e) {
  try { localConfig = require('../feishuConfig.json') } catch (e2) {}
}
const KEY_MAP = { FEISHU_APP_ID: 'appId', FEISHU_APP_SECRET: 'appSecret', FEISHU_BITABLE_APP_TOKEN: 'bitableAppToken', FEISHU_TABLE_CATEGORIES: 'tableCategories', FEISHU_TABLE_ITEMS: 'tableItems', FEISHU_TABLE_INVENTORY_LOGS: 'tableInventoryLogs', FEISHU_TABLE_BORROW_RECORDS: 'tableBorrowRecords' }
function getConfig(key) { return process.env[key] || localConfig.feishu[KEY_MAP[key]] || '' }

const FEISHU_BASE = 'https://open.feishu.cn/open-apis/bitable/v1/apps'
const CATEGORIES_TABLE = getConfig('FEISHU_TABLE_CATEGORIES')
const ITEMS_TABLE = getConfig('FEISHU_TABLE_ITEMS')
const INVENTORY_LOGS_TABLE = getConfig('FEISHU_TABLE_INVENTORY_LOGS')
const BORROW_RECORDS_TABLE = getConfig('FEISHU_TABLE_BORROW_RECORDS')

function getAppToken() {
  const token = getConfig('FEISHU_BITABLE_APP_TOKEN')
  if (!token) throw new Error('请配置 Bitable App Token')
  return token
}

async function getTenantAccessToken() {
  const db = cloud.database()
  const cacheRes = await db.collection('system_cache').where({ key: 'feishu_token_cache' }).get()
  if (cacheRes.data && cacheRes.data.length > 0 && cacheRes.data[0].expire_at > Date.now() / 1000) {
    return cacheRes.data[0].token
  }
  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: getConfig('FEISHU_APP_ID'), app_secret: getConfig('FEISHU_APP_SECRET')
  }, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  if (res.data.code !== 0) throw new Error(`获取飞书token失败: ${res.data.msg}`)
  const token = res.data.tenant_access_token
  const expireAt = Math.floor(Date.now() / 1000) + (res.data.expire || 7200) - 300
  if (cacheRes.data && cacheRes.data.length > 0) {
    await db.collection('system_cache').doc(cacheRes.data[0]._id).update({ token, expire_at: expireAt })
  } else {
    await db.collection('system_cache').add({ data: { key: 'feishu_token_cache', token, expire_at: expireAt } })
  }
  return token
}

async function bitableRequest(method, path, data = null, params = null) {
  const token = await getTenantAccessToken()
  const config = {
    method, url: `${FEISHU_BASE}/${getAppToken()}${path}`,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' }
  }
  if (data) config.data = data
  if (params) config.params = params
  const res = await axios(config)
  if (res.data.code !== 0) throw new Error(`飞书API错误: ${res.data.msg}`)
  return res.data.data
}

function fromRecord(record) {
  return { _id: record.record_id, ...record.fields }
}

// ===== 货物类型 =====

async function getCategoryList() {
  const res = await bitableRequest('GET', `/tables/${CATEGORIES_TABLE}/records`, null, { page_size: 500 })
  return (res.items || []).map(fromRecord)
}

async function createCategory(data) {
  const res = await bitableRequest('POST', `/tables/${CATEGORIES_TABLE}/records`, {
    fields: { name: data.name, description: data.description || '', created_at: Date.now() }
  })
  return fromRecord(res.record)
}

async function updateCategory(recordId, data) {
  const fields = {}
  if (data.name !== undefined) fields.name = data.name
  if (data.description !== undefined) fields.description = data.description
  const res = await bitableRequest('PUT', `/tables/${CATEGORIES_TABLE}/records/${recordId}`, { fields })
  return fromRecord(res.record)
}

async function deleteCategory(recordId) {
  await bitableRequest('DELETE', `/tables/${CATEGORIES_TABLE}/records/${recordId}`)
  return { success: true }
}

// ===== 货物 =====

async function getItemList(params = {}) {
  const queryParams = { page_size: 100 }
  if (params.categoryId) {
    queryParams.filter = `CurrentValue.[category_id] = "${params.categoryId}"`
  }
  if (params.keyword) {
    queryParams.filter = queryParams.filter
      ? queryParams.filter + ` AND CurrentValue.[name] CONTAINS "${params.keyword}"`
      : `CurrentValue.[name] CONTAINS "${params.keyword}"`
  }
  if (params.status) {
    queryParams.filter = queryParams.filter
      ? queryParams.filter + ` AND CurrentValue.[status] = "${params.status}"`
      : `CurrentValue.[status] = "${params.status}"`
  }
  const res = await bitableRequest('GET', `/tables/${ITEMS_TABLE}/records`, null, queryParams)
  return (res.items || []).map(fromRecord)
}

async function getItemDetail(recordId) {
  const res = await bitableRequest('GET', `/tables/${ITEMS_TABLE}/records/${recordId}`)
  return fromRecord(res.record)
}

async function createItem(data) {
  const res = await bitableRequest('POST', `/tables/${ITEMS_TABLE}/records`, {
    fields: {
      name: data.name,
      category_id: data.categoryId || '',
      category_name: data.categoryName || '',
      total_quantity: Number(data.totalQuantity) || 0,
      available_quantity: Number(data.totalQuantity) || 0,
      borrowed_quantity: 0,
      description: data.description || '',
      image_url: data.imageUrl || '',
      status: 'active',
      created_at: Date.now()
    }
  })
  return fromRecord(res.record)
}

async function updateItem(recordId, data) {
  const fields = {}
  if (data.name !== undefined) fields.name = data.name
  if (data.categoryId !== undefined) fields.category_id = data.categoryId
  if (data.categoryName !== undefined) fields.category_name = data.categoryName
  if (data.totalQuantity !== undefined) fields.total_quantity = Number(data.totalQuantity)
  if (data.description !== undefined) fields.description = data.description
  if (data.imageUrl !== undefined) fields.image_url = data.imageUrl
  if (data.status !== undefined) fields.status = data.status
  const res = await bitableRequest('PUT', `/tables/${ITEMS_TABLE}/records/${recordId}`, { fields })
  return fromRecord(res.record)
}

// 库存调整
async function adjustInventory(data) {
  const openid = cloud.getWXContext().OPENID
  const item = await getItemDetail(data.itemId)
  const beforeQty = item.available_quantity || 0
  let afterQty = beforeQty
  let qtyChange = Math.abs(Number(data.quantity))

  switch (data.changeType) {
    case 'stock_in':
      afterQty = beforeQty + qtyChange
      break
    case 'stock_out':
      afterQty = Math.max(0, beforeQty - qtyChange)
      qtyChange = beforeQty - afterQty
      break
    case 'adjust':
      afterQty = Number(data.quantity)
      qtyChange = Math.abs(afterQty - beforeQty)
      break
    default:
      throw new Error(`不支持的变更类型: ${data.changeType}`)
  }

  // 更新库存
  await bitableRequest('PUT', `/tables/${ITEMS_TABLE}/records/${data.itemId}`, {
    fields: { available_quantity: afterQty }
  })

  // 记录日志
  await bitableRequest('POST', `/tables/${INVENTORY_LOGS_TABLE}/records`, {
    fields: {
      item_id: data.itemId,
      item_name: item.name,
      change_type: data.changeType,
      quantity: qtyChange,
      before_quantity: beforeQty,
      after_quantity: afterQty,
      reason: data.reason || '',
      operator_id: openid,
      operator_name: data.operatorName || '',
      created_at: Date.now()
    }
  })

  return { success: true, beforeQuantity: beforeQty, afterQuantity: afterQty }
}

// 库存变更记录
async function getInventoryLogs(params = {}) {
  const queryParams = { page_size: 100 }
  if (params.itemId) {
    queryParams.filter = `CurrentValue.[item_id] = "${params.itemId}"`
  }
  const res = await bitableRequest('GET', `/tables/${INVENTORY_LOGS_TABLE}/records`, null, queryParams)
  return (res.items || []).map(fromRecord)
}

// 获取某货物当前借用人
async function getItemBorrowers(itemId) {
  const res = await bitableRequest('GET', `/tables/${BORROW_RECORDS_TABLE}/records`, null, {
    page_size: 500,
    filter: `CurrentValue.[item_id] = "${itemId}" AND CurrentValue.[status] = "collected"`
  })
  return (res.items || []).map(fromRecord)
}

exports.main = async (event) => {
  const { action } = event
  try {
    let result
    switch (action) {
      case 'getCategoryList': result = await getCategoryList(); break
      case 'createCategory': result = await createCategory(event); break
      case 'updateCategory': result = await updateCategory(event.recordId, event); break
      case 'deleteCategory': result = await deleteCategory(event.recordId); break
      case 'getItemList': result = await getItemList(event); break
      case 'getItemDetail': result = await getItemDetail(event.id); break
      case 'createItem': result = await createItem(event); break
      case 'updateItem': result = await updateItem(event.recordId, event); break
      case 'adjustInventory': result = await adjustInventory(event); break
      case 'getInventoryLogs': result = await getInventoryLogs(event); break
      case 'getItemBorrowers': result = await getItemBorrowers(event.itemId); break
      default: throw new Error(`未知操作: ${action}`)
    }
    return { code: 0, data: result }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}
