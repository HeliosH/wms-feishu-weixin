const { fromRecord } = require('./feishu-client')

async function getCategoryList(client, tableIds) {
  const res = await client.request('GET', `/tables/${tableIds.categories}/records`, null, { page_size: 500 })
  return (res.items || []).map(fromRecord)
}

async function createCategory(client, tableIds, data) {
  const res = await client.request('POST', `/tables/${tableIds.categories}/records`, {
    fields: { name: data.name, description: data.description || '', created_at: Date.now() }
  })
  return fromRecord(res.record)
}

async function updateCategory(client, tableIds, recordId, data) {
  const fields = {}
  if (data.name !== undefined) fields.name = data.name
  if (data.description !== undefined) fields.description = data.description
  const res = await client.request('PUT', `/tables/${tableIds.categories}/records/${recordId}`, { fields })
  return fromRecord(res.record)
}

async function deleteCategory(client, tableIds, recordId) {
  await client.request('DELETE', `/tables/${tableIds.categories}/records/${recordId}`)
  return { success: true }
}

async function getItemList(client, tableIds, params = {}) {
  const queryParams = { page_size: 100 }
  const filters = []
  if (params.categoryId) {
    filters.push(`CurrentValue.[category_id]="${params.categoryId}"`)
  }
  if (params.status) {
    filters.push(`CurrentValue.[status]="${params.status}"`)
  }
  if (filters.length > 0) {
    queryParams.filter = filters.join('&&')
  }
  const res = await client.request('GET', `/tables/${tableIds.items}/records`, null, queryParams)
  return (res.items || []).map(fromRecord)
}

async function getItemDetail(client, tableIds, recordId) {
  const res = await client.request('GET', `/tables/${tableIds.items}/records/${recordId}`)
  return fromRecord(res.record)
}

async function createItem(client, tableIds, data) {
  const res = await client.request('POST', `/tables/${tableIds.items}/records`, {
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

async function updateItem(client, tableIds, recordId, data) {
  const fields = {}
  if (data.name !== undefined) fields.name = data.name
  if (data.categoryId !== undefined) fields.category_id = data.categoryId
  if (data.categoryName !== undefined) fields.category_name = data.categoryName
  if (data.totalQuantity !== undefined) fields.total_quantity = Number(data.totalQuantity)
  if (data.description !== undefined) fields.description = data.description
  if (data.imageUrl !== undefined) fields.image_url = data.imageUrl
  if (data.status !== undefined) fields.status = data.status
  const res = await client.request('PUT', `/tables/${tableIds.items}/records/${recordId}`, { fields })
  return fromRecord(res.record)
}

async function adjustInventory(client, tableIds, openid, data) {
  const item = await getItemDetail(client, tableIds, data.itemId)
  const beforeQty = Number(item.available_quantity) || 0
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

  await client.request('PUT', `/tables/${tableIds.items}/records/${data.itemId}`, {
    fields: { available_quantity: afterQty }
  })

  try {
    await client.request('POST', `/tables/${tableIds.inventoryLogs}/records`, {
      fields: {
        item_id: data.itemId, item_name: item.name,
        change_type: data.changeType, quantity: qtyChange,
        before_quantity: beforeQty, after_quantity: afterQty,
        reason: data.reason || '', operator_id: openid,
        operator_name: data.operatorName || '', created_at: Date.now()
      }
    })
  } catch (err) {
    console.error(`[adjustInventory] 日志写入失败:`, err.message)
  }

  return { success: true, beforeQuantity: beforeQty, afterQuantity: afterQty }
}

async function getInventoryLogs(client, tableIds, params = {}) {
  const queryParams = { page_size: 100 }
  if (params.itemId) {
    queryParams.filter = `CurrentValue.[item_id]="${params.itemId}"`
  }
  const res = await client.request('GET', `/tables/${tableIds.inventoryLogs}/records`, null, queryParams)
  return (res.items || []).map(fromRecord)
}

async function getItemBorrowers(client, tableIds, itemId) {
  const res = await client.request('GET', `/tables/${tableIds.borrowRecords}/records`, null, {
    page_size: 500,
    filter: `CurrentValue.[item_id]="${itemId}"`
  })
  return (res.items || []).map(fromRecord).filter(r => r.status === 'collected')
}

module.exports = {
  getCategoryList, createCategory, updateCategory, deleteCategory,
  getItemList, getItemDetail, createItem, updateItem,
  adjustInventory, getInventoryLogs, getItemBorrowers
}
