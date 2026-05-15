/**
 * 本地集成测试 — 覆盖所有云函数业务逻辑
 *
 * 直接调用 cloudfunctions/common/ 中的纯逻辑函数，
 * 用内存缓存替代微信云数据库，用测试 openid 替代 cloud.getWXContext().OPENID。
 *
 * 运行: node test/local-test.js
 */
const path = require('path')
const fs = require('fs')
const { createFeishuClient, borrowLogic, itemLogic, userLogic } = require('../cloudfunctions/common')

// ---- 配置 ----
const config = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'cloudfunctions', 'feishuConfig.json'), 'utf-8'
)).feishu

// 内存缓存（替代云数据库 system_cache）
const cache = {
  _store: new Map(),
  async get(key) {
    const e = this._store.get(key)
    if (e && e.expireAt > Date.now() / 1000) return e.token
    return null
  },
  async set(key, token, expireAt) {
    this._store.set(key, { token, expireAt })
  }
}

const client = createFeishuClient({
  appId: config.appId,
  appSecret: config.appSecret,
  bitableAppToken: config.bitableAppToken,
  cache
})

const T = {
  users: config.tableUsers,
  categories: config.tableCategories,
  items: config.tableItems,
  borrowRecords: config.tableBorrowRecords,
  inventoryLogs: config.tableInventoryLogs
}

// 测试用户 openid（模拟微信 openid）
const ADMIN = 'test_admin_local'
const BORROWER = 'test_borrower_local'
const NEWBIE = 'test_newbie_local'

// ---- 清理追踪 ----
const trash = { categories: [], items: [], borrows: [], logs: [], users: [] }
let passed = 0, failed = 0

// ---- 测试工具 ----
async function test(name, fn) {
  process.stdout.write(`  ${name}... `.padEnd(50))
  try {
    await fn()
    console.log('OK')
    passed++
  } catch (err) {
    console.log(`FAIL\n       ${err.message}`)
    failed++
  }
}

function ok(cond, msg) { if (!cond) throw new Error(msg || '断言失败') }

// ---- 初始化/清理 ----
async function ensureUser(openid, roles, status) {
  let user = await userLogic.findUserByOpenid(client, T.users, openid)
  if (!user) {
    const res = await client.request('POST', `/tables/${T.users}/records`, {
      fields: { openid, name: openid, avatar_url: '', role: roles, status, created_at: Date.now() }
    })
    user = { _id: res.record.record_id, ...res.record.fields }
  } else {
    const needUpdate = JSON.stringify(user.role) !== JSON.stringify(roles) || user.status !== status
    if (needUpdate) {
      await client.request('PUT', `/tables/${T.users}/records/${user._id}`, {
        fields: { role: roles, status }
      })
      user.role = roles
      user.status = status
    }
  }
  trash.users.push(user._id)
  return user
}

async function cleanup() {
  console.log('\n清理测试数据...')
  // 逆序删除：日志 → 借用记录 → 货物 → 分类 → 用户
  for (const id of trash.logs) {
    try { await client.request('DELETE', `/tables/${T.inventoryLogs}/records/${id}`) } catch (e) {}
  }
  for (const id of trash.borrows) {
    try { await client.request('DELETE', `/tables/${T.borrowRecords}/records/${id}`) } catch (e) {}
  }
  for (const id of trash.items) {
    try { await client.request('DELETE', `/tables/${T.items}/records/${id}`) } catch (e) {}
  }
  for (const id of trash.categories) {
    try { await client.request('DELETE', `/tables/${T.categories}/records/${id}`) } catch (e) {}
  }
  for (const id of trash.users) {
    try { await client.request('DELETE', `/tables/${T.users}/records/${id}`) } catch (e) {}
  }
  console.log('  完成')
}

// ================================================================
// 测试套件
// ================================================================
async function run() {
  console.log('=== 飞书 WMS 业务逻辑 本地集成测试 ===\n')
  console.log(`Bitable: ${config.bitableAppToken}`)

  // ---- 初始化 ----
  await ensureUser(ADMIN, ['admin'], 'active')
  await ensureUser(BORROWER, ['borrower'], 'active')

  // ========================
  // 1. 用户管理
  // ========================
  console.log('\n[1] 用户管理')

  await test('login 已存在用户', async () => {
    const u = await userLogic.login(client, T, ADMIN)
    ok(u.status === 'active', 'status 应为 active')
    ok(u.role.includes('admin'), 'role 应含 admin')
  })

  await test('login 新用户自动注册', async () => {
    const u = await userLogic.login(client, T, NEWBIE)
    ok(u.status === 'pending', '新用户 status 应为 pending')
    ok(!u.role || u.role.length === 0, '新用户 role 应为空')
  })

  await test('login 已禁用用户应失败', async () => {
    // 临时禁用 borrower
    await userLogic.toggleUserStatus(client, T, BORROWER, 'inactive')
    try {
      await userLogic.login(client, T, BORROWER)
      throw new Error('应该抛出错误')
    } catch (e) {
      ok(e.message.includes('已被禁用'), '应提示已被禁用')
    }
    // 恢复
    await ensureUser(BORROWER, ['borrower'], 'active')
  })

  await test('getUserList', async () => {
    const list = await userLogic.getUserList(client, T)
    ok(Array.isArray(list), '应返回数组')
    ok(list.length > 0, '不应为空')
  })

  await test('applyRole', async () => {
    await userLogic.applyRole(client, T, NEWBIE, '测试新人')
    const u = await userLogic.findUserByOpenid(client, T.users, NEWBIE)
    ok(u.status === 'pending_review', 'status 应为 pending_review')
  })

  await test('applyRole 重复申请应失败', async () => {
    try {
      await userLogic.applyRole(client, T, NEWBIE, '测试新人')
      throw new Error('应该抛出错误')
    } catch (e) {
      ok(e.message.includes('已有待审批'), '应提示已有待审批')
    }
  })

  await test('approveRole 通过', async () => {
    await userLogic.approveRole(client, T, NEWBIE, true, ['borrower'])
    const u = await userLogic.findUserByOpenid(client, T.users, NEWBIE)
    ok(u.status === 'active', 'status 应为 active')
    ok(u.role.includes('borrower'), 'role 应含 borrower')
  })

  // 测试完 NEWBIE，重置为 pending 以便后续测试
  await client.request('PUT', `/tables/${T.users}/records/${(await userLogic.findUserByOpenid(client, T.users, NEWBIE))._id}`, {
    fields: { status: 'pending', role: [] }
  })

  await test('approveRole 拒绝', async () => {
    // 先让 NEWBIE 再次申请
    await userLogic.applyRole(client, T, NEWBIE, '测试新人')
    await userLogic.approveRole(client, T, NEWBIE, false, [])
    const u = await userLogic.findUserByOpenid(client, T.users, NEWBIE)
    ok(u.status === 'pending', '拒绝后 status 应为 pending')
    ok(!u.role || u.role.length === 0, '拒绝后 role 应为空')
  })

  await test('updateUserRole', async () => {
    await userLogic.updateUserRole(client, T, BORROWER, ['borrower', 'warehouse_admin'])
    const u = await userLogic.findUserByOpenid(client, T.users, BORROWER)
    ok(u.role.includes('warehouse_admin'), 'role 应含 warehouse_admin')
    // 还原
    await userLogic.updateUserRole(client, T, BORROWER, ['borrower'])
  })

  await test('updateUserRole 不可移除 admin', async () => {
    try {
      await userLogic.updateUserRole(client, T, ADMIN, ['borrower'])
      throw new Error('应该抛出错误')
    } catch (e) {
      ok(e.message.includes('管理员角色不可移除'), '应提示不可移除')
    }
  })

  await test('toggleUserStatus 不可禁用 admin', async () => {
    try {
      await userLogic.toggleUserStatus(client, T, ADMIN, 'inactive')
      throw new Error('应该抛出错误')
    } catch (e) {
      ok(e.message.includes('管理员账号不可禁用'), '应提示不可禁用')
    }
  })

  // ========================
  // 2. 分类管理
  // ========================
  console.log('\n[2] 分类管理')

  let catId

  await test('createCategory', async () => {
    const cat = await itemLogic.createCategory(client, T, {
      name: '测试分类-本地测试', description: '验证分类 CRUD'
    })
    ok(cat.name === '测试分类-本地测试', 'name 应一致')
    ok(cat._id, '应有 _id')
    catId = cat._id
    trash.categories.push(catId)
  })

  await test('getCategoryList', async () => {
    const list = await itemLogic.getCategoryList(client, T)
    ok(list.some(c => c._id === catId), '应包含刚创建的分类')
  })

  await test('updateCategory', async () => {
    const cat = await itemLogic.updateCategory(client, T, catId, {
      name: '测试分类-已修改', description: '已更新'
    })
    ok(cat.name === '测试分类-已修改', 'name 应更新')
  })

  await test('deleteCategory', async () => {
    const r = await itemLogic.deleteCategory(client, T, catId)
    ok(r.success, '应返回 success')
    trash.categories = trash.categories.filter(id => id !== catId)
  })

  // ========================
  // 3. 货物管理
  // ========================
  console.log('\n[3] 货物管理')

  let catId2, itemId

  await test('创建测试分类（供货物使用）', async () => {
    const cat = await itemLogic.createCategory(client, T, {
      name: '货物测试分类', description: ''
    })
    catId2 = cat._id
    trash.categories.push(catId2)
  })

  await test('createItem', async () => {
    const item = await itemLogic.createItem(client, T, {
      name: '测试货物-本地测试',
      categoryId: catId2,
      categoryName: '货物测试分类',
      totalQuantity: 100,
      description: '验证货物 CRUD'
    })
    ok(Number(item.available_quantity) === 100, '初始可用应为 100')
    ok(Number(item.borrowed_quantity) === 0, '初始借用应为 0')
    ok(item.status === 'active', '初始状态应为 active')
    itemId = item._id
    trash.items.push(itemId)
  })

  await test('getItemList', async () => {
    const list = await itemLogic.getItemList(client, T, {})
    ok(list.some(i => i._id === itemId), '应包含刚创建的货物')
  })

  await test('getItemList 按分类筛选', async () => {
    const list = await itemLogic.getItemList(client, T, { categoryId: catId2 })
    ok(list.every(i => i.category_id === catId2), '应全是该分类')
  })

  await test('getItemDetail', async () => {
    const item = await itemLogic.getItemDetail(client, T, itemId)
    ok(item._id === itemId, '_id 应一致')
  })

  await test('updateItem', async () => {
    const item = await itemLogic.updateItem(client, T, itemId, {
      name: '测试货物-已修改', description: '已更新描述'
    })
    ok(item.name === '测试货物-已修改', 'name 应更新')
  })

  // ========================
  // 4. 库存调整
  // ========================
  console.log('\n[4] 库存调整')

  await test('stock_in 入库', async () => {
    const r = await itemLogic.adjustInventory(client, T, ADMIN, {
      itemId, changeType: 'stock_in', quantity: 50, reason: '入库测试', operatorName: '管理员'
    })
    ok(r.afterQuantity === 150, `入库后应为 150，实际 ${r.afterQuantity}`)
    const item = await itemLogic.getItemDetail(client, T, itemId)
    ok(Number(item.available_quantity) === 150, `available 应为 150，实际 ${item.available_quantity}`)
  })

  await test('stock_out 出库', async () => {
    const r = await itemLogic.adjustInventory(client, T, ADMIN, {
      itemId, changeType: 'stock_out', quantity: 30, reason: '出库测试', operatorName: '管理员'
    })
    ok(r.afterQuantity === 120, `出库后应为 120，实际 ${r.afterQuantity}`)
  })

  await test('adjust 盘点调整', async () => {
    const r = await itemLogic.adjustInventory(client, T, ADMIN, {
      itemId, changeType: 'adjust', quantity: 200, reason: '盘点调整为200', operatorName: '管理员'
    })
    ok(r.afterQuantity === 200, `盘点后应为 200，实际 ${r.afterQuantity}`)
  })

  await test('getInventoryLogs', async () => {
    const logs = await itemLogic.getInventoryLogs(client, T, { itemId })
    ok(logs.length >= 3, `至少有 3 条日志，实际 ${logs.length}`)
    // 追踪日志以清理
    logs.forEach(l => { if (!trash.logs.includes(l._id)) trash.logs.push(l._id) })
  })

  // ========================
  // 5. 借用全流程
  // ========================
  console.log('\n[5] 借用全流程')

  let borrowId

  await test('applyBorrow', async () => {
    const record = await borrowLogic.applyBorrow(client, T, BORROWER, {
      itemId, quantity: 3, remark: '测试借用申请'
    })
    ok(record.status === 'pending_approval', '状态应为 pending_approval')
    ok(record.quantity === 3, '数量应为 3')
    ok(record.borrower_id === BORROWER, '借用人应一致')
    borrowId = record._id
    trash.borrows.push(borrowId)
  })

  await test('applyBorrow 库存不足应失败', async () => {
    try {
      await borrowLogic.applyBorrow(client, T, BORROWER, {
        itemId, quantity: 99999, remark: '超出库存'
      })
      throw new Error('应该抛出错误')
    } catch (e) {
      ok(e.message.includes('库存不足'), `应提示库存不足，实际: ${e.message}`)
    }
  })

  await test('approveBorrow', async () => {
    const record = await borrowLogic.approveBorrow(client, T, ADMIN, borrowId)
    ok(record.status === 'approved', '状态应为 approved')
    ok(record.approver_id === ADMIN, '审批人应一致')

    // 验证库存扣减
    const item = await itemLogic.getItemDetail(client, T, itemId)
    ok(Number(item.available_quantity) === 197, `审批后可用应为 197，实际 ${item.available_quantity}`)
    ok(Number(item.borrowed_quantity) === 3, `审批后借用应为 3，实际 ${item.borrowed_quantity}`)

    // 追踪新增的日志
    const logs = await itemLogic.getInventoryLogs(client, T, { itemId })
    logs.forEach(l => { if (!trash.logs.includes(l._id)) trash.logs.push(l._id) })
  })

  await test('approveBorrow 重复审批应失败', async () => {
    try {
      await borrowLogic.approveBorrow(client, T, ADMIN, borrowId)
      throw new Error('应该抛出错误')
    } catch (e) {
      ok(e.message.includes('不在待审批状态'), `应提示不在待审批，实际: ${e.message}`)
    }
  })

  await test('confirmCollect', async () => {
    const record = await borrowLogic.confirmCollect(client, T, ADMIN, borrowId)
    ok(record.status === 'collected', '状态应为 collected')
    ok(record.collect_operator, '应有操作人')
  })

  await test('confirmCollect 非 approved 状态应失败', async () => {
    try {
      await borrowLogic.confirmCollect(client, T, ADMIN, borrowId)
      throw new Error('应该抛出错误')
    } catch (e) {
      ok(e.message.includes('不在已审批状态'), `应提示不在已审批，实际: ${e.message}`)
    }
  })

  await test('confirmReturn', async () => {
    const record = await borrowLogic.confirmReturn(client, T, ADMIN, borrowId, '')
    ok(record.status === 'returned', '状态应为 returned')
    ok(record.return_operator, '应有操作人')

    // 验证库存恢复
    const item = await itemLogic.getItemDetail(client, T, itemId)
    ok(Number(item.available_quantity) === 200, `归还后可用应为 200，实际 ${item.available_quantity}`)
    ok(Number(item.borrowed_quantity) === 0, `归还后借用应为 0，实际 ${item.borrowed_quantity}`)

    // 追踪新增的日志
    const logs = await itemLogic.getInventoryLogs(client, T, { itemId })
    logs.forEach(l => { if (!trash.logs.includes(l._id)) trash.logs.push(l._id) })
  })

  await test('confirmReturn 非 collected 状态应失败', async () => {
    try {
      await borrowLogic.confirmReturn(client, T, ADMIN, borrowId, '')
      throw new Error('应该抛出错误')
    } catch (e) {
      ok(e.message.includes('不在已领取状态'), `应提示不在已领取，实际: ${e.message}`)
    }
  })

  // ========================
  // 6. 驳回流程
  // ========================
  console.log('\n[6] 驳回流程')

  let borrowId2

  await test('applyBorrow（第二条）', async () => {
    const record = await borrowLogic.applyBorrow(client, T, BORROWER, {
      itemId, quantity: 2, remark: '测试驳回'
    })
    borrowId2 = record._id
    trash.borrows.push(borrowId2)
    ok(record.status === 'pending_approval', '状态应为 pending_approval')
  })

  await test('rejectBorrow', async () => {
    const record = await borrowLogic.rejectBorrow(client, T, ADMIN, borrowId2, '测试驳回原因')
    ok(record.status === 'rejected', '状态应为 rejected')
    ok(record.reject_reason === '测试驳回原因', '驳回原因应一致')

    // 验证库存未被扣减
    const item = await itemLogic.getItemDetail(client, T, itemId)
    ok(Number(item.available_quantity) === 200, `驳回后可用仍为 200，实际 ${item.available_quantity}`)
  })

  await test('getBorrowList 按状态筛选', async () => {
    const rejected = await borrowLogic.getBorrowList(client, T, { status: 'rejected' })
    ok(rejected.some(r => r._id === borrowId2), '应包含被驳回的记录')

    const returned = await borrowLogic.getBorrowList(client, T, { status: 'returned' })
    ok(returned.some(r => r._id === borrowId), '应包含已归还的记录')
  })

  // ========================
  // 7. 补录
  // ========================
  console.log('\n[7] 补录')

  await test('backfillBorrow', async () => {
    const record = await borrowLogic.backfillBorrow(client, T, ADMIN, {
      itemId, borrowerOpenid: BORROWER, quantity: 5,
      remark: '补录测试', applyTime: Date.now()
    })
    ok(record.status === 'collected', '补录后状态应为 collected')
    ok(record.borrower_id === BORROWER, '借用人应一致')
    trash.borrows.push(record._id)

    // 验证库存扣减
    const item = await itemLogic.getItemDetail(client, T, itemId)
    ok(Number(item.available_quantity) === 195, `补录后可用应为 195，实际 ${item.available_quantity}`)
    ok(Number(item.borrowed_quantity) === 5, `补录后借用应为 5，实际 ${item.borrowed_quantity}`)

    // 追踪日志
    const logs = await itemLogic.getInventoryLogs(client, T, { itemId })
    logs.forEach(l => { if (!trash.logs.includes(l._id)) trash.logs.push(l._id) })
  })

  // ========================
  // 8. getItemBorrowers
  // ========================
  console.log('\n[8] 当前借用人')

  await test('getItemBorrowers', async () => {
    const borrowers = await itemLogic.getItemBorrowers(client, T, itemId)
    ok(borrowers.some(b => b.borrower_id === BORROWER), '应包含测试借用人')
    ok(borrowers.every(b => b.status === 'collected'), '应全是 collected 状态')
  })

  // ========================
  // 结果
  // ========================
  console.log(`\n========================================`)
  console.log(`  通过: ${passed}  |  失败: ${failed}`)
  console.log(`========================================`)
}

// ---- 主入口 ----
run()
  .then(() => cleanup())
  .then(() => {
    if (failed > 0) process.exit(1)
  })
  .catch(err => {
    console.error('\n测试异常:', err)
    cleanup().then(() => process.exit(1))
  })
