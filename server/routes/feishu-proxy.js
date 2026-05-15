const express = require('express')
const router = express.Router()
const { feishuClient } = require('../config')
const { fromRecord, toBitableFields } = require('../common')

async function listRecords(tableId, filter, pageSize, pageToken) {
  const params = { page_size: pageSize || 100 }
  if (filter) params.filter = filter
  if (pageToken) params.page_token = pageToken
  const res = await feishuClient.request('GET', `/tables/${tableId}/records`, null, params)
  res.items = (res.items || []).map(fromRecord)
  res.total = res.total || res.items.length
  return res
}

async function getRecord(tableId, recordId) {
  const res = await feishuClient.request('GET', `/tables/${tableId}/records/${recordId}`)
  return fromRecord(res.record)
}

async function createRecord(tableId, fields) {
  const res = await feishuClient.request('POST', `/tables/${tableId}/records`, { fields: toBitableFields(fields) })
  return fromRecord(res.record)
}

async function updateRecord(tableId, recordId, fields) {
  const res = await feishuClient.request('PUT', `/tables/${tableId}/records/${recordId}`, { fields: toBitableFields(fields) })
  return fromRecord(res.record)
}

async function deleteRecord(tableId, recordId) {
  return feishuClient.request('DELETE', `/tables/${tableId}/records/${recordId}`)
}

async function batchCreateRecords(tableId, records) {
  const res = await feishuClient.request('POST', `/tables/${tableId}/records/batch_create`, {
    records: records.map(r => ({ fields: toBitableFields(r) }))
  })
  return res
}

router.post('/', async (req, res) => {
  const { action, tableId, recordId, fields, filter, pageSize, pageToken, records } = req.body
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
    res.json({ code: 0, data: result })
  } catch (err) {
    res.json({ code: -1, message: err.message })
  }
})

module.exports = router
