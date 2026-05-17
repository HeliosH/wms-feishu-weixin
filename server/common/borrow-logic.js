const { fromRecord } = require('./feishu-client')

async function getUserByOpenid(client, usersTableId, openid) {
  const res = await client.request('GET', `/tables/${usersTableId}/records`, null, {
    filter: `CurrentValue.[openid]="${openid}"`,
    page_size: 1
  })
  if (res.items && res.items.length > 0) return fromRecord(res.items[0])
  return null
}

async function applyBorrow(client, tableIds, openid, data) {
  const user = await getUserByOpenid(client, tableIds.users, openid)
  if (!user) throw new Error('用户不存在')
  if (user.status === 'inactive') throw new Error('账号已被禁用')

  const quantity = Number(data.quantity) || 1

  const item = fromRecord((await client.request('GET', `/tables/${tableIds.items}/records/${data.itemId}`)).record)
  if (Number(item.available_quantity) < quantity) {
    throw new Error(`库存不足，当前可用: ${Number(item.available_quantity) || 0}`)
  }

  const res = await client.request('POST', `/tables/${tableIds.borrowRecords}/records`, {
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

async function getBorrowList(client, tableIds, params = {}) {
  const queryParams = { page_size: 100 }
  const filters = []

  if (params.status) {
    filters.push(`CurrentValue.[status]="${params.status}"`)
  }
  if (params.borrowerId) {
    filters.push(`CurrentValue.[borrower_id]="${params.borrowerId}"`)
  }
  if (params.itemId) {
    filters.push(`CurrentValue.[item_id]="${params.itemId}"`)
  }
  if (filters.length > 0) {
    queryParams.filter = filters.join('&&')
  }

  const res = await client.request('GET', `/tables/${tableIds.borrowRecords}/records`, null, queryParams)
  return (res.items || []).map(fromRecord)
}

async function approveBorrow(client, tableIds, openid, recordId) {
  const user = await getUserByOpenid(client, tableIds.users, openid)

  const record = fromRecord((await client.request('GET', `/tables/${tableIds.borrowRecords}/records/${recordId}`)).record)
  const recQty = Number(record.quantity) || 0
  if (record.status !== 'pending_approval') {
    throw new Error('该记录不在待审批状态')
  }

  const item = fromRecord((await client.request('GET', `/tables/${tableIds.items}/records/${record.item_id}`)).record)
  const itemAvail = Number(item.available_quantity) || 0
  const itemBorrowed = Number(item.borrowed_quantity) || 0
  if (itemAvail < recQty) {
    throw new Error(`库存不足，当前可用: ${itemAvail}，需要: ${recQty}`)
  }

  const newAvailable = itemAvail - recQty
  const newBorrowed = itemBorrowed + recQty

  // Saga step 1: 先改借用记录状态为 approved（轻量，失败时可补偿回滚）
  const res = await client.request('PUT', `/tables/${tableIds.borrowRecords}/records/${recordId}`, {
    fields: {
      status: 'approved',
      approver_id: openid,
      approver_name: user.name || '',
      approve_time: Date.now()
    }
  })

  // Saga step 2: 扣减库存（关键步骤，失败时补偿 step 1）
  try {
    await client.request('PUT', `/tables/${tableIds.items}/records/${record.item_id}`, {
      fields: { available_quantity: newAvailable, borrowed_quantity: newBorrowed }
    })
  } catch (err) {
    // 补偿：回滚借用记录到 pending_approval
    await client.request('PUT', `/tables/${tableIds.borrowRecords}/records/${recordId}`, {
      fields: { status: 'pending_approval', approver_id: '', approver_name: '', approve_time: null }
    }).catch(() => {})
    throw new Error(`库存扣减失败，已回滚审批状态: ${err.message}`)
  }

  // Saga step 3: 写库存日志（非关键，失败不影响核心数据一致性）
  try {
    await client.request('POST', `/tables/${tableIds.inventoryLogs}/records`, {
      fields: {
        item_id: record.item_id,
        item_name: record.item_name,
        change_type: 'borrow',
        quantity: recQty,
        before_quantity: itemAvail,
        after_quantity: newAvailable,
        reason: `借出审批通过 - ${record.borrower_name}`,
        operator_id: openid,
        operator_name: user.name || '',
        created_at: Date.now()
      }
    })
  } catch (err) {
    console.error(`[approveBorrow] 库存日志写入失败 (record: ${recordId}):`, err.message)
  }

  return fromRecord(res.record)
}

async function rejectBorrow(client, tableIds, openid, recordId, reason) {
  const user = await getUserByOpenid(client, tableIds.users, openid)

  const record = fromRecord((await client.request('GET', `/tables/${tableIds.borrowRecords}/records/${recordId}`)).record)
  if (record.status !== 'pending_approval') {
    throw new Error('该记录不在待审批状态')
  }

  const res = await client.request('PUT', `/tables/${tableIds.borrowRecords}/records/${recordId}`, {
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

async function confirmCollect(client, tableIds, openid, recordId) {
  const user = await getUserByOpenid(client, tableIds.users, openid)

  const record = fromRecord((await client.request('GET', `/tables/${tableIds.borrowRecords}/records/${recordId}`)).record)
  if (record.status !== 'approved') {
    throw new Error('该记录不在已审批状态，无法确认领取')
  }

  const res = await client.request('PUT', `/tables/${tableIds.borrowRecords}/records/${recordId}`, {
    fields: {
      status: 'collected',
      collect_time: Date.now(),
      collect_photo: record.apply_photo || '',
      collect_operator: user.name || openid
    }
  })
  return fromRecord(res.record)
}

async function confirmReturn(client, tableIds, openid, recordId, photoUrl) {
  const user = await getUserByOpenid(client, tableIds.users, openid)

  const record = fromRecord((await client.request('GET', `/tables/${tableIds.borrowRecords}/records/${recordId}`)).record)
  const recQty = Number(record.quantity) || 0
  if (record.status !== 'collected') {
    throw new Error('该记录不在已领取状态，无法确认归还')
  }

  const item = fromRecord((await client.request('GET', `/tables/${tableIds.items}/records/${record.item_id}`)).record)
  const itemAvail = Number(item.available_quantity) || 0
  const itemBorrowed = Number(item.borrowed_quantity) || 0
  const newAvailable = itemAvail + recQty
  const newBorrowed = Math.max(0, itemBorrowed - recQty)

  // Saga step 1: 先改借用记录状态为 returned
  const res = await client.request('PUT', `/tables/${tableIds.borrowRecords}/records/${recordId}`, {
    fields: {
      status: 'returned',
      return_time: Date.now(),
      return_photo: photoUrl || '',
      return_operator: user.name || openid
    }
  })

  // Saga step 2: 恢复库存（关键步骤，失败时补偿 step 1）
  try {
    await client.request('PUT', `/tables/${tableIds.items}/records/${record.item_id}`, {
      fields: { available_quantity: newAvailable, borrowed_quantity: newBorrowed }
    })
  } catch (err) {
    // 补偿：回滚借用记录到 collected
    await client.request('PUT', `/tables/${tableIds.borrowRecords}/records/${recordId}`, {
      fields: { status: 'collected', return_time: null, return_photo: '', return_operator: '' }
    }).catch(() => {})
    throw new Error(`库存恢复失败，已回滚归还状态: ${err.message}`)
  }

  // Saga step 3: 写日志（非关键）
  try {
    await client.request('POST', `/tables/${tableIds.inventoryLogs}/records`, {
      fields: {
        item_id: record.item_id,
        item_name: record.item_name,
        change_type: 'return',
        quantity: recQty,
        before_quantity: itemAvail,
        after_quantity: newAvailable,
        reason: `归还确认 - ${record.borrower_name}`,
        operator_id: openid,
        operator_name: user.name || '',
        created_at: Date.now()
      }
    })
  } catch (err) {
    console.error(`[confirmReturn] 库存日志写入失败 (record: ${recordId}):`, err.message)
  }

  return fromRecord(res.record)
}

async function backfillBorrow(client, tableIds, openid, data) {
  const operator = await getUserByOpenid(client, tableIds.users, openid)
  if (!operator) throw new Error('操作人不存在')

  const borrower = await getUserByOpenid(client, tableIds.users, data.borrowerOpenid)
  if (!borrower) throw new Error('借用人不存在')

  const quantity = Number(data.quantity) || 1

  const item = fromRecord((await client.request('GET', `/tables/${tableIds.items}/records/${data.itemId}`)).record)
  const itemAvail = Number(item.available_quantity) || 0
  const itemBorrowed = Number(item.borrowed_quantity) || 0
  if (itemAvail < quantity) {
    throw new Error(`库存不足，当前可用: ${itemAvail}`)
  }

  const newAvailable = itemAvail - quantity
  const newBorrowed = itemBorrowed + quantity

  // Saga step 1: 先扣库存
  await client.request('PUT', `/tables/${tableIds.items}/records/${data.itemId}`, {
    fields: { available_quantity: newAvailable, borrowed_quantity: newBorrowed }
  })

  // Saga step 2: 创建借用记录（失败时补偿 step 1）
  const now = Date.now()
  let record
  try {
    const res = await client.request('POST', `/tables/${tableIds.borrowRecords}/records`, {
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
    record = fromRecord(res.record)
  } catch (err) {
    // 补偿：恢复库存
    await client.request('PUT', `/tables/${tableIds.items}/records/${data.itemId}`, {
      fields: { available_quantity: itemAvail, borrowed_quantity: itemBorrowed }
    }).catch(() => {})
    throw new Error(`创建借用记录失败，已回滚库存: ${err.message}`)
  }

  // Saga step 3: 写日志（非关键）
  try {
    await client.request('POST', `/tables/${tableIds.inventoryLogs}/records`, {
      fields: {
        item_id: data.itemId,
        item_name: item.name,
        change_type: 'borrow',
        quantity,
        before_quantity: itemAvail,
        after_quantity: newAvailable,
        reason: `补录借出 - ${borrower.name || data.borrowerOpenid}`,
        operator_id: openid,
        operator_name: operator.name || '',
        created_at: Date.now()
      }
    })
  } catch (err) {
    console.error(`[backfillBorrow] 库存日志写入失败 (item: ${data.itemId}):`, err.message)
  }

  return record
}

module.exports = {
  getUserByOpenid,
  applyBorrow,
  getBorrowList,
  approveBorrow,
  rejectBorrow,
  confirmCollect,
  confirmReturn,
  backfillBorrow
}
