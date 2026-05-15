const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { createFeishuClient, fromRecord, toBitableFields } = require('./common')

let localConfig = { feishu: {} }
try { localConfig = require('./config.json') } catch (e) {
  try { localConfig = require('../feishuConfig.json') } catch (e2) {}
}
const KEY_MAP = {
  FEISHU_APP_ID: 'appId', FEISHU_APP_SECRET: 'appSecret', FEISHU_BITABLE_APP_TOKEN: 'bitableAppToken'
}
function getConfig(key) { return process.env[key] || localConfig.feishu[KEY_MAP[key]] || '' }

const cache = {
  async get(key) {
    const db = cloud.database()
    const res = await db.collection('system_cache').where({ key }).get()
    if (res.data && res.data.length > 0 && res.data[0].expire_at > Date.now() / 1000) {
      return res.data[0].token
    }
    return null
  },
  async set(key, token, expireAt) {
    const db = cloud.database()
    const res = await db.collection('system_cache').where({ key }).get()
    if (res.data && res.data.length > 0) {
      await db.collection('system_cache').doc(res.data[0]._id).update({ token, expire_at: expireAt })
    } else {
      await db.collection('system_cache').add({ data: { key, token, expire_at: expireAt } })
    }
  }
}

const client = createFeishuClient({
  appId: getConfig('FEISHU_APP_ID'),
  appSecret: getConfig('FEISHU_APP_SECRET'),
  bitableAppToken: getConfig('FEISHU_BITABLE_APP_TOKEN'),
  cache
})

async function listRecords(tableId, filter, pageSize, pageToken) {
  const params = { page_size: pageSize || 100 }
  if (filter) params.filter = filter
  if (pageToken) params.page_token = pageToken
  const res = await client.request('GET', `/tables/${tableId}/records`, null, params)
  res.items = (res.items || []).map(fromRecord)
  res.total = res.total || res.items.length
  return res
}

async function getRecord(tableId, recordId) {
  const res = await client.request('GET', `/tables/${tableId}/records/${recordId}`)
  return fromRecord(res.record)
}

async function createRecord(tableId, fields) {
  const res = await client.request('POST', `/tables/${tableId}/records`, { fields: toBitableFields(fields) })
  return fromRecord(res.record)
}

async function updateRecord(tableId, recordId, fields) {
  const res = await client.request('PUT', `/tables/${tableId}/records/${recordId}`, { fields: toBitableFields(fields) })
  return fromRecord(res.record)
}

async function deleteRecord(tableId, recordId) {
  return client.request('DELETE', `/tables/${tableId}/records/${recordId}`)
}

async function batchCreateRecords(tableId, records) {
  const res = await client.request('POST', `/tables/${tableId}/records/batch_create`, {
    records: records.map(r => ({ fields: toBitableFields(r) }))
  })
  return res
}

exports.main = async (event) => {
  const { action, tableId, recordId, fields, filter, pageSize, pageToken, records } = event
  try {
    let result
    switch (action) {
      case 'list': result = await listRecords(tableId, filter, pageSize, pageToken); break
      case 'get': result = await getRecord(tableId, recordId); break
      case 'create': result = await createRecord(tableId, fields); break
      case 'update': result = await updateRecord(tableId, recordId, fields); break
      case 'delete': result = await deleteRecord(tableId, recordId); break
      case 'batchCreate': result = await batchCreateRecords(tableId, records); break
      default: throw new Error(`未知操作: ${action}`)
    }
    return { code: 0, data: result }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}
