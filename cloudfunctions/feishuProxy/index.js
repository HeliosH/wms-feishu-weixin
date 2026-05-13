const cloud = require('wx-server-sdk')
const axios = require('axios')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

let localConfig = { feishu: {} }
try { localConfig = require('./config.json') } catch (e) {
  try { localConfig = require('../feishuConfig.json') } catch (e2) {}
}
const KEY_MAP = { FEISHU_APP_ID: 'appId', FEISHU_APP_SECRET: 'appSecret', FEISHU_BITABLE_APP_TOKEN: 'bitableAppToken' }
function getConfig(key) { return process.env[key] || localConfig.feishu[KEY_MAP[key]] || '' }

const FEISHU_BASE = 'https://open.feishu.cn/open-apis/bitable/v1/apps'

function getAppToken() {
  const token = getConfig('FEISHU_BITABLE_APP_TOKEN')
  if (!token) throw new Error('请配置 Bitable App Token（环境变量或在 config.json 中填写）')
  return token
}

async function getTenantAccessToken() {
  const db = cloud.database()
  const TOKEN_CACHE_KEY = 'feishu_token_cache'

  const cacheRes = await db.collection('system_cache')
    .where({ key: TOKEN_CACHE_KEY })
    .get()

  if (cacheRes.data && cacheRes.data.length > 0) {
    const cached = cacheRes.data[0]
    if (cached.expire_at > Date.now() / 1000) {
      return cached.token
    }
  }

  const appId = getConfig('FEISHU_APP_ID')
  const appSecret = getConfig('FEISHU_APP_SECRET')

  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: appId,
    app_secret: appSecret
  }, { headers: { 'Content-Type': 'application/json' } })

  if (res.data.code !== 0) {
    throw new Error(`获取飞书token失败: ${res.data.msg}`)
  }

  const token = res.data.tenant_access_token
  const expireAt = Math.floor(Date.now() / 1000) + (res.data.expire || 7200) - 300

  if (cacheRes.data && cacheRes.data.length > 0) {
    await db.collection('system_cache').doc(cacheRes.data[0]._id).update({ token, expire_at: expireAt })
  } else {
    await db.collection('system_cache').add({ data: { key: TOKEN_CACHE_KEY, token, expire_at: expireAt } })
  }

  return token
}

async function bitableRequest(method, path, data = null, params = null) {
  const token = await getTenantAccessToken()
  const appToken = getAppToken()
  const url = `${FEISHU_BASE}/${appToken}${path}`

  const config = {
    method,
    url,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
  if (data) config.data = data
  if (params) config.params = params

  const res = await axios(config)

  if (res.data.code !== 0) {
    throw new Error(`飞书API错误: ${res.data.msg}`)
  }
  return res.data.data
}

// 表格记录操作
async function listRecords(tableId, filter = '', pageSize = 100, pageToken = '') {
  const params = { page_size: pageSize }
  if (filter) params.filter = filter
  if (pageToken) params.page_token = pageToken
  return bitableRequest('GET', `/tables/${tableId}/records`, null, params)
}

async function getRecord(tableId, recordId) {
  return bitableRequest('GET', `/tables/${tableId}/records/${recordId}`)
}

async function createRecord(tableId, fields) {
  return bitableRequest('POST', `/tables/${tableId}/records`, { fields })
}

async function updateRecord(tableId, recordId, fields) {
  return bitableRequest('PUT', `/tables/${tableId}/records/${recordId}`, { fields })
}

async function deleteRecord(tableId, recordId) {
  return bitableRequest('DELETE', `/tables/${tableId}/records/${recordId}`)
}

async function batchCreateRecords(tableId, records) {
  return bitableRequest('POST', `/tables/${tableId}/records/batch_create`, { records })
}

// 飞书字段名映射 — Bitable使用fields对象
// 将下划线命名转为Bitable字段格式
function toBitableFields(data) {
  const fields = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      fields[key] = value
    }
  }
  return fields
}

// 从Bitable记录中提取数据
function fromBitableRecord(record) {
  return {
    _id: record.record_id,
    ...record.fields
  }
}

exports.main = async (event) => {
  const { action, tableId, recordId, fields, filter, pageSize, pageToken, records } = event

  try {
    let result
    switch (action) {
      case 'list':
        result = await listRecords(tableId, filter, pageSize, pageToken)
        result.items = (result.items || []).map(fromBitableRecord)
        result.total = result.total || result.items.length
        break
      case 'get':
        result = fromBitableRecord(await getRecord(tableId, recordId))
        break
      case 'create':
        result = fromBitableRecord(await createRecord(tableId, toBitableFields(fields)))
        break
      case 'update':
        result = fromBitableRecord(await updateRecord(tableId, recordId, toBitableFields(fields)))
        break
      case 'delete':
        result = await deleteRecord(tableId, recordId)
        break
      case 'batchCreate':
        result = await batchCreateRecords(tableId, records.map(r => ({ fields: toBitableFields(r) })))
        break
      default:
        throw new Error(`未知操作: ${action}`)
    }
    return { code: 0, data: result }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}

// 导出给其他云函数直接调用
module.exports.getTenantAccessToken = getTenantAccessToken
module.exports.listRecords = listRecords
module.exports.getRecord = getRecord
module.exports.createRecord = createRecord
module.exports.updateRecord = updateRecord
module.exports.deleteRecord = deleteRecord
module.exports.fromBitableRecord = fromBitableRecord
module.exports.toBitableFields = toBitableFields
