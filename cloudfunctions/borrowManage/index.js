const cloud = require('wx-server-sdk')
const axios = require('axios')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

let localConfig = { feishu: {} }
try { localConfig = require('./config.json') } catch (e) {
  try { localConfig = require('../feishuConfig.json') } catch (e2) {}
}
const KEY_MAP = { FEISHU_APP_ID: 'appId', FEISHU_APP_SECRET: 'appSecret', FEISHU_BITABLE_APP_TOKEN: 'bitableAppToken', FEISHU_TABLE_BORROW_RECORDS: 'tableBorrowRecords', FEISHU_TABLE_ITEMS: 'tableItems', FEISHU_TABLE_INVENTORY_LOGS: 'tableInventoryLogs', FEISHU_TABLE_USERS: 'tableUsers' }
function getConfig(key) { return process.env[key] || localConfig.feishu[KEY_MAP[key]] || '' }

const FEISHU_BASE = 'https://open.feishu.cn/open-apis/bitable/v1/apps'
const BORROW_RECORDS_TABLE = getConfig('FEISHU_TABLE_BORROW_RECORDS')
const ITEMS_TABLE = getConfig('FEISHU_TABLE_ITEMS')
const INVENTORY_LOGS_TABLE = getConfig('FEISHU_TABLE_INVENTORY_LOGS')
const USERS_TABLE = getConfig('FEISHU_TABLE_USERS')

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

// 获取用户信息
async function getUserByOpenid(openid) {
  const res = await bitableRequest('GET', `/tables/${USERS_TABLE}/records`, null, {
    filter: `CurrentValue.[openid] = "${openid}"`, page_size: 1
  })
  if (res.items && res.items.length > 0) return fromRecord(res.items[0])
  return null
}

// 申请借用
async function applyBorrow(data) {
  const openid = cloud.getWXContext().OPENID
  const user = await getUserByOpenid(openid)
  if (!user) throw new Error('用户不存在')
  if (user.status === 'inactive') throw new Error('账号已被禁用')

  const quantity = Number(data.quantity) || 1

  // 检查库存
  const item = fromRecord((await bitableRequest('GET', `/tables/${ITEMS_TABLE}/records/${data.itemId}`)).record)
  if (item.available_quantity < quantity) {
    throw new Error(`库存不足，当前可用: ${item.available_quantity}`)
  }

  // 创建借用记录
  const res = await bitableRequest('POST', `/tables/${BORROW_RECORDS_TABLE}/records`, {
    fields: {
      item_id: data.itemId,
      item_name: item.name,
      borrower_id: openid,
      borrower_name: user.name || openid,
      quantity,
      status: 'pending_approval',
      apply_remark: data.remark || '',
      apply_time: Date.now(),
      apply_photo: data.photoUrl || '',
      approver_id: '',
      approver_name: '',
      approve_time: null,
      reject_reason: '',
      collect_time: null,
      collect_photo: '',
      collect_operator: '',
      return_time: null,
      return_photo: '',
      return_operator: ''
    }
  })
  return fromRecord(res.record)
}

// 获取借用列表
async function getBorrowList(params = {}) {
  const queryParams = { page_size: 100 }
  const filters = []

  if (params.status) {
    filters.push(`CurrentValue.[status] = "${params.status}"`)
  }
  if (params.borrowerId) {
    filters.push(`CurrentValue.[borrower_id] = "${params.borrowerId}"`)
  }
  if (params.itemId) {
    filters.push(`CurrentValue.[item_id] = "${params.itemId}"`)
  }
  if (filters.length > 0) {
    queryParams.filter = filters.join(' AND ')
  }

  const res = await bitableRequest('GET', `/tables/${BORROW_RECORDS_TABLE}/records`, null, queryParams)
  return (res.items || []).map(fromRecord)
}

// 审批通过
async function approveBorrow(recordId) {
  const openid = cloud.getWXContext().OPENID
  const user = await getUserByOpenid(openid)

  // 获取借用记录
  const record = fromRecord((await bitableRequest('GET', `/tables/${BORROW_RECORDS_TABLE}/records/${recordId}`)).record)
  if (record.status !== 'pending_approval') {
    throw new Error('该记录不在待审批状态')
  }

  // 检查库存
  const item = fromRecord((await bitableRequest('GET', `/tables/${ITEMS_TABLE}/records/${record.item_id}`)).record)
  if (item.available_quantity < record.quantity) {
    throw new Error(`库存不足，当前可用: ${item.available_quantity}，需要: ${record.quantity}`)
  }

  // 扣减库存
  const newAvailable = item.available_quantity - record.quantity
  const newBorrowed = (item.borrowed_quantity || 0) + record.quantity
  await bitableRequest('PUT', `/tables/${ITEMS_TABLE}/records/${record.item_id}`, {
    fields: { available_quantity: newAvailable, borrowed_quantity: newBorrowed }
  })

  // 记录库存变更日志
  await bitableRequest('POST', `/tables/${INVENTORY_LOGS_TABLE}/records`, {
    fields: {
      item_id: record.item_id,
      item_name: record.item_name,
      change_type: 'borrow',
      quantity: record.quantity,
      before_quantity: item.available_quantity,
      after_quantity: newAvailable,
      reason: `借出审批通过 - ${record.borrower_name}`,
      operator_id: openid,
      operator_name: user.name || '',
      created_at: Date.now()
    }
  })

  // 更新借用记录状态
  const res = await bitableRequest('PUT', `/tables/${BORROW_RECORDS_TABLE}/records/${recordId}`, {
    fields: {
      status: 'approved',
      approver_id: openid,
      approver_name: user.name || '',
      approve_time: Date.now()
    }
  })
  return fromRecord(res.record)
}

// 审批驳回
async function rejectBorrow(recordId, reason) {
  const openid = cloud.getWXContext().OPENID
  const user = await getUserByOpenid(openid)

  const record = fromRecord((await bitableRequest('GET', `/tables/${BORROW_RECORDS_TABLE}/records/${recordId}`)).record)
  if (record.status !== 'pending_approval') {
    throw new Error('该记录不在待审批状态')
  }

  const res = await bitableRequest('PUT', `/tables/${BORROW_RECORDS_TABLE}/records/${recordId}`, {
    fields: {
      status: 'rejected',
      approver_id: openid,
      approver_name: user.name || '',
      approve_time: Date.now(),
      reject_reason: reason || ''
    }
  })
  return fromRecord(res.record)
}

// 领取确认 — 使用申请人拍照作为领取留档
async function confirmCollect(recordId) {
  const openid = cloud.getWXContext().OPENID
  const user = await getUserByOpenid(openid)

  const record = fromRecord((await bitableRequest('GET', `/tables/${BORROW_RECORDS_TABLE}/records/${recordId}`)).record)
  if (record.status !== 'approved') {
    throw new Error('该记录不在已审批状态，无法确认领取')
  }

  const res = await bitableRequest('PUT', `/tables/${BORROW_RECORDS_TABLE}/records/${recordId}`, {
    fields: {
      status: 'collected',
      collect_time: Date.now(),
      collect_photo: record.apply_photo || '',
      collect_operator: user.name || openid
    }
  })
  return fromRecord(res.record)
}

// 归还确认
async function confirmReturn(recordId, photoUrl) {
  const openid = cloud.getWXContext().OPENID
  const user = await getUserByOpenid(openid)

  const record = fromRecord((await bitableRequest('GET', `/tables/${BORROW_RECORDS_TABLE}/records/${recordId}`)).record)
  if (record.status !== 'collected') {
    throw new Error('该记录不在已领取状态，无法确认归还')
  }

  // 恢复库存
  const item = fromRecord((await bitableRequest('GET', `/tables/${ITEMS_TABLE}/records/${record.item_id}`)).record)
  const newAvailable = item.available_quantity + record.quantity
  const newBorrowed = Math.max(0, (item.borrowed_quantity || 0) - record.quantity
)
  await bitableRequest('PUT', `/tables/${ITEMS_TABLE}/records/${record.item_id}`, {
    fields: { available_quantity: newAvailable, borrowed_quantity: newBorrowed }
  })

  // 记录库存变更日志
  await bitableRequest('POST', `/tables/${INVENTORY_LOGS_TABLE}/records`, {
    fields: {
      item_id: record.item_id,
      item_name: record.item_name,
      change_type: 'return',
      quantity: record.quantity,
      before_quantity: item.available_quantity,
      after_quantity: newAvailable,
      reason: `归还确认 - ${record.borrower_name}`,
      operator_id: openid,
      operator_name: user.name || '',
      created_at: Date.now()
    }
  })

  // 更新借用记录
  const res = await bitableRequest('PUT', `/tables/${BORROW_RECORDS_TABLE}/records/${recordId}`, {
    fields: {
      status: 'returned',
      return_time: Date.now(),
      return_photo: photoUrl || '',
      return_operator: user.name || openid
    }
  })
  return fromRecord(res.record)
}

// 补录领取记录 — 直接将已领取货物录入系统，结果与正常流程一致
async function backfillBorrow(data) {
  const openid = cloud.getWXContext().OPENID
  const operator = await getUserByOpenid(openid)
  if (!operator) throw new Error('操作人不存在')

  const borrower = await getUserByOpenid(data.borrowerOpenid)
  if (!borrower) throw new Error('借用人不存在')

  const quantity = Number(data.quantity) || 1

  const item = fromRecord((await bitableRequest('GET', `/tables/${ITEMS_TABLE}/records/${data.itemId}`)).record)
  if (item.available_quantity < quantity) {
    throw new Error(`库存不足，当前可用: ${item.available_quantity}`)
  }

  // 扣减库存
  const newAvailable = item.available_quantity - quantity
  const newBorrowed = (item.borrowed_quantity || 0) + quantity
  await bitableRequest('PUT', `/tables/${ITEMS_TABLE}/records/${data.itemId}`, {
    fields: { available_quantity: newAvailable, borrowed_quantity: newBorrowed }
  })

  // 记录库存变更日志
  await bitableRequest('POST', `/tables/${INVENTORY_LOGS_TABLE}/records`, {
    fields: {
      item_id: data.itemId,
      item_name: item.name,
      change_type: 'borrow',
      quantity,
      before_quantity: item.available_quantity,
      after_quantity: newAvailable,
      reason: `补录借出 - ${borrower.name || data.borrowerOpenid}`,
      operator_id: openid,
      operator_name: operator.name || '',
      created_at: Date.now()
    }
  })

  const now = Date.now()
  const res = await bitableRequest('POST', `/tables/${BORROW_RECORDS_TABLE}/records`, {
    fields: {
      item_id: data.itemId,
      item_name: item.name,
      borrower_id: data.borrowerOpenid,
      borrower_name: borrower.name || data.borrowerOpenid,
      quantity,
      status: 'collected',
      apply_remark: `补录 - ${data.remark || ''}`,
      apply_time: data.applyTime || now,
      apply_photo: data.photoUrl || '',
      approver_id: openid,
      approver_name: operator.name || '',
      approve_time: now,
      reject_reason: '',
      collect_time: now,
      collect_photo: data.photoUrl || '',
      collect_operator: operator.name || openid,
      return_time: null,
      return_photo: '',
      return_operator: ''
    }
  })
  return fromRecord(res.record)
}

exports.main = async (event) => {
  const { action } = event
  try {
    let result
    switch (action) {
      case 'applyBorrow': result = await applyBorrow(event); break
      case 'getBorrowList': result = await getBorrowList(event); break
      case 'approveBorrow': result = await approveBorrow(event.id); break
      case 'rejectBorrow': result = await rejectBorrow(event.id, event.reason); break
      case 'confirmCollect': result = await confirmCollect(event.id); break
      case 'confirmReturn': result = await confirmReturn(event.id, event.photoUrl); break
      case 'backfillBorrow': result = await backfillBorrow(event); break
      default: throw new Error(`未知操作: ${action}`)
    }
    return { code: 0, data: result }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}
