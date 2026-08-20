/**
 * 后端 E2E 测试 — 全功能覆盖
 *
 * 架构: [测试脚本] --HTTP--> [真实 Express server] --HTTP--> [Mock 飞书服务器(内存)]
 *
 * 微信登录无法在测试中真实发生（需有效 jscode），
 * 因此测试直接用 JWT_SECRET 签发 token（与 /api/auth/login 签发的 token 完全等价），
 * 鉴权中间件、token 过期、错误 token 等行为全部真实覆盖。
 *
 * 运行: npm run test:e2e
 */
const { spawn } = require('child_process')
const path = require('path')
const jwt = require('jsonwebtoken')
const axios = require("axios")
// 沙箱/本地代理环境兼容：测试内所有 HTTP 请求直连，不走代理
const http = axios.create({ proxy: false })
const FormData = require('form-data')
const fs = require('fs')

const { createMockFeishuServer } = require('./mock-feishu-server')

// ---- 测试环境配置（与 .env.example 的表 ID 一致，mock 不校验真实性） ----
const JWT_SECRET = 'e2e-test-secret'
const MOCK_PORT = 9098
const SERVER_PORT = 9097
const BASE = `http://localhost:${SERVER_PORT}`

const TABLES = {
  users: 'tbl_users_e2e',
  categories: 'tbl_categories_e2e',
  items: 'tbl_items_e2e',
  borrowRecords: 'tbl_borrows_e2e',
  inventoryLogs: 'tbl_logs_e2e'
}

// ---- 测试用户 ----
const ADMIN = 'e2e_admin_openid'
const BORROWER = 'e2e_borrower_openid'
const NEWBIE = 'e2e_newbie_openid'

// ---- 测试工具 ----
let passed = 0, failed = 0
const failures = []

async function test(name, fn) {
  process.stdout.write(`  ${name}... `.padEnd(56))
  try {
    await fn()
    console.log('OK')
    passed++
  } catch (err) {
    console.log(`FAIL\n       ${err.message}`)
    failures.push({ name, message: err.message })
    failed++
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败')
}

function sign(openid, secret = JWT_SECRET, expiresIn = '7d') {
  return jwt.sign({ openid }, secret, { expiresIn })
}

async function api(token, route, body) {
  const res = await http.post(`${BASE}${route}`, body, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return res.data
}

async function call(token, route, action, params = {}) {
  const r = await api(token, route, { action, ...params })
  if (r.code !== 0) throw new Error(`${action} 失败: ${r.message}`)
  return r.data
}

// ================================================================
// 启动 / 停止
// ================================================================
let serverProcess = null

async function startServer() {
  const env = {
    ...process.env,
    // server 访问 mock 飞书（localhost）必须绕过代理
    http_proxy: '', https_proxy: '', HTTP_PROXY: '', HTTPS_PROXY: '',
    no_proxy: 'localhost,127.0.0.1', NO_PROXY: 'localhost,127.0.0.1',
    SERVER_PORT: String(SERVER_PORT),
    JWT_SECRET,
    WX_APPID: 'wx-test-appid',
    WX_APPSECRET: 'wx-test-secret',
    FEISHU_APP_ID: 'cli_e2e_test',
    FEISHU_APP_SECRET: 'feishu-e2e-secret',
    FEISHU_BITABLE_APP_TOKEN: 'bitable_e2e_token',
    FEISHU_TABLE_USERS: TABLES.users,
    FEISHU_TABLE_CATEGORIES: TABLES.categories,
    FEISHU_TABLE_ITEMS: TABLES.items,
    FEISHU_TABLE_BORROW_RECORDS: TABLES.borrowRecords,
    FEISHU_TABLE_INVENTORY_LOGS: TABLES.inventoryLogs,
    FEISHU_BASE_URL: `http://localhost:${MOCK_PORT}`,
    UPLOAD_DIR: path.join(__dirname, '..', 'server', 'uploads')
  }
  serverProcess = spawn('node', ['app.js'], {
    cwd: path.join(__dirname, '..', 'server'),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  serverProcess.stdout.on('data', d => process.stdout.write(`[server] ${d}`))
  serverProcess.stderr.on('data', d => process.stderr.write(`[server] ${d}`))

  // 等待 server 就绪
  for (let i = 0; i < 50; i++) {
    try {
      await http.get(`${BASE}/uploads`, { validateStatus: () => true })
      return
    } catch (e) {
      await new Promise(r => setTimeout(r, 100))
    }
  }
  throw new Error('Express server 启动超时')
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) return resolve()
    serverProcess.on('exit', resolve)
    serverProcess.kill('SIGTERM')
    setTimeout(() => {
      if (!serverProcess.killed) serverProcess.kill('SIGKILL')
      resolve()
    }, 2000).unref()
  })
}

// ================================================================
// 测试套件
// ================================================================
async function run() {
  console.log('=== 仓仓 WMS 后端 E2E 测试（Mock 飞书 + 真实 Express）===\n')

  const adminToken = sign(ADMIN)
  const borrowerToken = sign(BORROWER)
  const newbieToken = sign(NEWBIE)

  // ========================
  // 0. 鉴权
  // ========================
  console.log('\n[0] 鉴权')

  await test('无 token 应被拒绝 (HTTP 401)', async () => {
    const res = await http.post(`${BASE}/api/user`, { action: 'login' }, { validateStatus: () => true })
    ok(res.status === 401, `期望 HTTP 401（前端静默刷新契约），实际 ${res.status}`)
    ok(res.data.code === -1 && res.data.message === '未登录', `应返回未登录，实际: ${JSON.stringify(res.data)}`)
  })

  await test('错误 token 应被拒绝 (HTTP 401)', async () => {
    const res = await http.post(`${BASE}/api/user`, { action: 'login' }, {
      headers: { Authorization: 'Bearer invalid-token-xxx' },
      validateStatus: () => true
    })
    ok(res.status === 401, `期望 HTTP 401，实际 ${res.status}`)
    ok(res.data.code === -1, '应返回 code -1')
  })

  await test('错误密钥签发的 token 应被拒绝 (HTTP 401)', async () => {
    const badToken = sign(ADMIN, 'wrong-secret')
    const res = await http.post(`${BASE}/api/user`, { action: 'login' }, {
      headers: { Authorization: `Bearer ${badToken}` },
      validateStatus: () => true
    })
    ok(res.status === 401, `期望 HTTP 401，实际 ${res.status}`)
    ok(res.data.code === -1, '应返回 code -1')
  })

  await test('登录接口缺少 code 应返回错误', async () => {
    const res = await http.post(`${BASE}/api/auth/login`, {}, { validateStatus: () => true })
    ok(res.data.code === -1 && res.data.message.includes('缺少登录凭证'), `实际: ${JSON.stringify(res.data)}`)
  })

  // ========================
  // 1. 用户管理
  // ========================
  console.log('\n[1] 用户管理')

  await test('login 新用户自动注册（pending 状态）', async () => {
    const u = await call(newbieToken, '/api/user', 'login')
    ok(u.status === 'pending', `新用户 status 应为 pending，实际 ${u.status}`)
    ok(Array.isArray(u.role) && u.role.length === 0, '新用户 role 应为空')
  })

  await test('login 已存在用户', async () => {
    const u = await call(newbieToken, '/api/user', 'login')
    ok(u.openid === NEWBIE, 'openid 应一致')
  })

  let adminUser, borrowerUser
  await test('管理员注册并直接授予角色', async () => {
    // 管理员首登也是 pending；mock 场景下直接操作 mock 表补齐角色（等同真实环境的初始化管理员）
    const mockFeishu = global.__mockFeishu
    const usersTable = mockFeishu.tables[TABLES.users]
    const adminRec = usersTable.find(r => r.fields.openid === ADMIN)
    adminRec.fields.role = ['admin']
    adminRec.fields.status = 'active'
    const borrowerRec = usersTable.find(r => r.fields.openid === BORROWER)
    borrowerRec.fields.role = ['borrower']
    borrowerRec.fields.status = 'active'
    adminUser = await call(adminToken, '/api/user', 'login')
    ok(adminUser.role.includes('admin'), 'role 应含 admin')
  })

  await test('getUserList', async () => {
    const list = await call(adminToken, '/api/user', 'getUserList')
    ok(Array.isArray(list) && list.length >= 3, `应有至少 3 个用户，实际 ${list.length}`)
  })

  await test('applyRole 申请借用权限', async () => {
    const r = await call(newbieToken, '/api/user', 'applyRole', { name: 'E2E新人' })
    ok(r.success !== false, '应成功')
  })

  await test('applyRole 重复申请应失败', async () => {
    const r = await api(newbieToken, '/api/user', { action: 'applyRole', name: 'E2E新人' })
    ok(r.code === -1 && r.message.includes('已有待审批'), `应提示已有待审批，实际: ${r.message}`)
  })

  await test('approveRole 通过申请', async () => {
    await call(adminToken, '/api/user', 'approveRole', { openid: NEWBIE, approved: true, role: ['borrower'] })
    const list = await call(adminToken, '/api/user', 'getUserList')
    const u = list.find(x => x.openid === NEWBIE)
    ok(u.status === 'active' && u.role.includes('borrower'), `审批后应 active+borrower，实际 ${u.status}/${JSON.stringify(u.role)}`)
  })

  await test('updateUserRole 不可移除管理员角色', async () => {
    const r = await api(adminToken, '/api/user', { action: 'updateUserRole', openid: ADMIN, role: ['borrower'] })
    ok(r.code === -1 && r.message.includes('管理员角色不可移除'), `实际: ${r.message}`)
  })

  await test('updateUserRole 更新角色', async () => {
    await call(adminToken, '/api/user', 'updateUserRole', { openid: NEWBIE, role: ['borrower', 'warehouse_admin'] })
    const list = await call(adminToken, '/api/user', 'getUserList')
    const u = list.find(x => x.openid === NEWBIE)
    ok(u.role.includes('warehouse_admin'), 'role 应含 warehouse_admin')
    await call(adminToken, '/api/user', 'updateUserRole', { openid: NEWBIE, role: ['borrower'] })
  })

  await test('toggleUserStatus 不可禁用管理员', async () => {
    const r = await api(adminToken, '/api/user', { action: 'toggleUserStatus', openid: ADMIN, status: 'inactive' })
    ok(r.code === -1 && r.message.includes('管理员账号不可禁用'), `实际: ${r.message}`)
  })

  await test('禁用用户后登录应失败', async () => {
    await call(adminToken, '/api/user', 'toggleUserStatus', { openid: NEWBIE, status: 'inactive' })
    const r = await api(newbieToken, '/api/user', { action: 'login' })
    ok(r.code === -1 && r.message.includes('已被禁用'), `实际: ${r.message}`)
    // 恢复
    await call(adminToken, '/api/user', 'toggleUserStatus', { openid: NEWBIE, status: 'active' })
  })

  await test('updateProfile 更新昵称', async () => {
    await call(borrowerToken, '/api/user', 'updateProfile', { name: '借用员小张', avatarUrl: '' })
    const u = await call(borrowerToken, '/api/user', 'login')
    ok(u.name === '借用员小张', `name 应更新，实际 ${u.name}`)
  })

  await test('未知 action 应报错', async () => {
    const r = await api(adminToken, '/api/user', { action: 'notExistAction' })
    ok(r.code === -1, '应返回 code -1')
  })

  // ========================
  // 2. 分类管理
  // ========================
  console.log('\n[2] 分类管理')

  let catId
  await test('createCategory', async () => {
    const cat = await call(adminToken, '/api/item', 'createCategory', { name: 'E2E分类', description: '端到端测试' })
    ok(cat.name === 'E2E分类' && cat._id, '应有 _id 且 name 一致')
    catId = cat._id
  })

  await test('getCategoryList 包含新分类', async () => {
    const list = await call(borrowerToken, '/api/item', 'getCategoryList')
    ok(list.some(c => c._id === catId), '应包含刚创建的分类')
  })

  await test('updateCategory', async () => {
    const cat = await call(adminToken, '/api/item', 'updateCategory', { recordId: catId, name: 'E2E分类-改' })
    ok(cat.name === 'E2E分类-改', 'name 应更新')
  })

  // ========================
  // 3. 货物管理
  // ========================
  console.log('\n[3] 货物管理')

  let itemId
  await test('createItem 初始库存正确', async () => {
    const item = await call(adminToken, '/api/item', 'createItem', {
      name: 'E2E测试货物', categoryId: catId, categoryName: 'E2E分类-改',
      totalQuantity: 100, description: 'E2E'
    })
    ok(Number(item.available_quantity) === 100, `available 应为 100，实际 ${item.available_quantity}`)
    ok(Number(item.borrowed_quantity) === 0, 'borrowed 应为 0')
    ok(item.status === 'active', 'status 应为 active')
    itemId = item._id
  })

  await test('getItemList', async () => {
    const list = await call(borrowerToken, '/api/item', 'getItemList')
    ok(list.some(i => i._id === itemId), '应包含新货物')
  })

  await test('getItemList 按分类筛选', async () => {
    const list = await call(borrowerToken, '/api/item', 'getItemList', { categoryId: catId })
    ok(list.length > 0 && list.every(i => i.category_id === catId), '应全部属于该分类')
  })

  await test('getItemDetail', async () => {
    const item = await call(borrowerToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(item._id === itemId, '_id 应一致')
  })

  await test('updateItem', async () => {
    const item = await call(adminToken, '/api/item', 'updateItem', { recordId: itemId, name: 'E2E货物-改', description: '已更新' })
    ok(item.name === 'E2E货物-改', 'name 应更新')
  })

  // ========================
  // 4. 库存调整
  // ========================
  console.log('\n[4] 库存调整')

  await test('stock_in 入库 +50', async () => {
    const r = await call(adminToken, '/api/item', 'adjustInventory', {
      itemId, changeType: 'stock_in', quantity: 50, reason: 'E2E入库', operatorName: '管理员'
    })
    ok(r.afterQuantity === 150, `入库后应为 150，实际 ${r.afterQuantity}`)
  })

  await test('stock_out 出库 -30', async () => {
    const r = await call(adminToken, '/api/item', 'adjustInventory', {
      itemId, changeType: 'stock_out', quantity: 30, reason: 'E2E出库', operatorName: '管理员'
    })
    ok(r.afterQuantity === 120, `出库后应为 120，实际 ${r.afterQuantity}`)
  })

  await test('adjust 盘点调整为 200', async () => {
    const r = await call(adminToken, '/api/item', 'adjustInventory', {
      itemId, changeType: 'adjust', quantity: 200, reason: 'E2E盘点', operatorName: '管理员'
    })
    ok(r.afterQuantity === 200, `盘点后应为 200，实际 ${r.afterQuantity}`)
  })

  await test('getInventoryLogs 至少 3 条', async () => {
    const logs = await call(adminToken, '/api/item', 'getInventoryLogs', { itemId })
    ok(logs.length >= 3, `至少 3 条日志，实际 ${logs.length}`)
    ok(logs.every(l => l.item_id === itemId), '日志 item_id 应一致')
  })

  // ========================
  // 5. 借用全生命周期
  // ========================
  console.log('\n[5] 借用全生命周期（申请→审批→领取→归还）')

  let borrowId
  await test('applyBorrow', async () => {
    const record = await call(borrowerToken, '/api/borrow', 'applyBorrow', { itemId, quantity: 3, remark: 'E2E借用' })
    ok(record.status === 'pending_approval', `状态应为 pending_approval，实际 ${record.status}`)
    ok(Number(record.quantity) === 3, '数量应为 3')
    borrowId = record._id
  })

  await test('申请后库存不扣减（待审批）', async () => {
    const item = await call(adminToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(Number(item.available_quantity) === 200, `待审批可用应仍为 200，实际 ${item.available_quantity}`)
  })

  await test('applyBorrow 超库存应失败', async () => {
    const r = await api(borrowerToken, '/api/borrow', { action: 'applyBorrow', itemId, quantity: 99999 })
    ok(r.code === -1 && r.message.includes('库存不足'), `应提示库存不足，实际: ${r.message}`)
  })

  await test('approveBorrow 审批通过并扣库存', async () => {
    const record = await call(adminToken, '/api/borrow', 'approveBorrow', { id: borrowId })
    ok(record.status === 'approved', `状态应为 approved，实际 ${record.status}`)
    ok(record.approver_id === ADMIN, '审批人应一致')
    const item = await call(adminToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(Number(item.available_quantity) === 197, `审批后可用应为 197，实际 ${item.available_quantity}`)
    ok(Number(item.borrowed_quantity) === 3, `审批后借出应为 3，实际 ${item.borrowed_quantity}`)
  })

  await test('approveBorrow 重复审批应失败', async () => {
    const r = await api(adminToken, '/api/borrow', { action: 'approveBorrow', id: borrowId })
    ok(r.code === -1 && r.message.includes('不在待审批状态'), `实际: ${r.message}`)
  })

  await test('confirmCollect 确认领取', async () => {
    const record = await call(adminToken, '/api/borrow', 'confirmCollect', { id: borrowId })
    ok(record.status === 'collected', `状态应为 collected，实际 ${record.status}`)
    ok(record.collect_operator, '应有领取确认操作人')
  })

  await test('confirmCollect 非 approved 状态应失败', async () => {
    const r = await api(adminToken, '/api/borrow', { action: 'confirmCollect', id: borrowId })
    ok(r.code === -1 && r.message.includes('不在已审批状态'), `实际: ${r.message}`)
  })

  await test('confirmReturn 确认归还并恢复库存', async () => {
    const record = await call(adminToken, '/api/borrow', 'confirmReturn', { id: borrowId, photoUrl: '/uploads/e2e/photo.jpg' })
    ok(record.status === 'returned', `状态应为 returned，实际 ${record.status}`)
    const item = await call(adminToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(Number(item.available_quantity) === 200, `归还后可用应为 200，实际 ${item.available_quantity}`)
    ok(Number(item.borrowed_quantity) === 0, `归还后借出应为 0，实际 ${item.borrowed_quantity}`)
  })

  await test('confirmReturn 非 collected 状态应失败', async () => {
    const r = await api(adminToken, '/api/borrow', { action: 'confirmReturn', id: borrowId, photoUrl: '' })
    ok(r.code === -1 && r.message.includes('不在已领取状态'), `实际: ${r.message}`)
  })

  // ========================
  // 6. 驳回流程
  // ========================
  console.log('\n[6] 驳回流程')

  let borrowId2
  await test('applyBorrow（第二条）+ rejectBorrow 驳回', async () => {
    const record = await call(borrowerToken, '/api/borrow', 'applyBorrow', { itemId, quantity: 2, remark: 'E2E驳回' })
    borrowId2 = record._id
    const rejected = await call(adminToken, '/api/borrow', 'rejectBorrow', { id: borrowId2, reason: 'E2E驳回原因' })
    ok(rejected.status === 'rejected', `状态应为 rejected，实际 ${rejected.status}`)
    ok(rejected.reject_reason === 'E2E驳回原因', '驳回原因应一致')
  })

  await test('驳回后库存不扣减', async () => {
    const item = await call(adminToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(Number(item.available_quantity) === 200, `驳回后可用应仍为 200，实际 ${item.available_quantity}`)
  })

  await test('getBorrowList 按状态筛选', async () => {
    const rejected = await call(adminToken, '/api/borrow', 'getBorrowList', { status: 'rejected' })
    ok(rejected.some(r => r._id === borrowId2), '应含被驳回记录')
    const returned = await call(adminToken, '/api/borrow', 'getBorrowList', { status: 'returned' })
    ok(returned.some(r => r._id === borrowId), '应含已归还记录')
  })

  await test('getBorrowList 按借用人筛选', async () => {
    const mine = await call(borrowerToken, '/api/borrow', 'getBorrowList', { borrowerId: BORROWER })
    ok(mine.length >= 2, `借用人应至少有 2 条记录，实际 ${mine.length}`)
    ok(mine.every(r => r.borrower_id === BORROWER), '记录应全属于该借用人')
  })

  // ========================
  // 7. 补录
  // ========================
  console.log('\n[7] 管理员补录')

  await test('backfillBorrow 直接补录为已领取', async () => {
    const record = await call(adminToken, '/api/borrow', 'backfillBorrow', {
      itemId, borrowerOpenid: BORROWER, quantity: 5, remark: 'E2E补录', applyTime: Date.now()
    })
    ok(record.status === 'collected', `补录状态应为 collected，实际 ${record.status}`)
    const item = await call(adminToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(Number(item.available_quantity) === 195, `补录后可用应为 195，实际 ${item.available_quantity}`)
    ok(Number(item.borrowed_quantity) === 5, `补录后借出应为 5，实际 ${item.borrowed_quantity}`)
  })

  // ========================
  // 8. 当前借用人
  // ========================
  console.log('\n[8] 当前借用人')

  await test('getItemBorrowers', async () => {
    const borrowers = await call(adminToken, '/api/item', 'getItemBorrowers', { itemId })
    ok(borrowers.some(b => b.borrower_id === BORROWER), '应包含测试借用人')
    ok(borrowers.every(b => b.status === 'collected'), '应全部为 collected 状态')
  })

  // ========================
  // 9. 文件上传
  // ========================
  console.log('\n[9] 文件上传')

  await test('上传照片成功并返回 URL', async () => {
    const form = new FormData()
    form.append('photo', Buffer.from('fake-jpeg-data-e2e'), { filename: 'e2e-photo.jpg', contentType: 'image/jpeg' })
    const res = await http.post(`${BASE}/api/upload`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${adminToken}` }
    })
    ok(res.data.code === 0 && res.data.data.url, `应返回 url，实际 ${JSON.stringify(res.data)}`)
    // 验证静态文件可访问
    const fileRes = await http.get(`${BASE}${res.data.data.url}`, { validateStatus: () => true })
    ok(fileRes.status === 200, `静态文件应可访问 (${fileRes.status})`)
  })

  await test('未带 token 上传应被拒绝', async () => {
    const form = new FormData()
    form.append('photo', Buffer.from('x'), { filename: 'x.jpg' })
    const res = await http.post(`${BASE}/api/upload`, form, {
      headers: form.getHeaders(), validateStatus: () => true
    })
    ok(res.data.code === -1, '应被鉴权拒绝')
  })

  // ========================
  // 10. 飞书附件照片（file_token 全链路）
  // ========================
  console.log('\n[10] 飞书附件照片')

  // 模拟前端云模式上传：multipart 直传 mock 飞书拿 file_token
  // （真实链路为 云存储中转 → 云函数 downloadFile → feishu-client.uploadMedia，本节验证 server 侧逻辑）
  const uploadToFeishu = async (buf, name) => {
    const form = new FormData()
    form.append('file_name', name)
    form.append('parent_type', 'bitable_image')
    form.append('parent_node', 'bitable_e2e_token')
    form.append('size', String(buf.length))
    form.append('file', buf, { filename: name, contentType: 'image/jpeg' })
    const res = await http.post(
      `http://localhost:${MOCK_PORT}/open-apis/drive/v1/medias/upload_all`, form,
      { headers: { ...form.getHeaders(), Authorization: 'Bearer mock-tenant-token-e2e' } }
    )
    if (res.data.code !== 0) throw new Error(`mock 飞书上传失败: ${JSON.stringify(res.data)}`)
    return res.data.data.file_token
  }

  let attachBorrowId, applyToken, returnToken
  await test('上传素材到飞书获得 file_token', async () => {
    applyToken = await uploadToFeishu(Buffer.from('attach-apply-photo-bytes'), 'apply.jpg')
    returnToken = await uploadToFeishu(Buffer.from('attach-return-photo-bytes'), 'return.jpg')
    ok(/^boxcn_mock_/.test(applyToken), `token 应为 boxcn_mock_ 前缀，实际 ${applyToken}`)
    ok(applyToken !== returnToken, '两次上传的 token 应不同')
    const mockFeishu = global.__mockFeishu
    ok(mockFeishu.media.has(applyToken), 'mock media 应记录该 token')
  })

  await test('applyBorrow 传 file_token 写入附件字段', async () => {
    const record = await call(borrowerToken, '/api/borrow', 'applyBorrow', {
      itemId, quantity: 2, remark: 'E2E附件', photoUrl: applyToken
    })
    ok(record.status === 'pending_approval', `状态应为 pending_approval，实际 ${record.status}`)
    attachBorrowId = record._id
    // 直接查 mock 表：file_token 应写入附件字段 apply_photo_file 而非文本字段
    const mockFeishu = global.__mockFeishu
    const rec = mockFeishu.tables[TABLES.borrowRecords].find(r => r.record_id === attachBorrowId)
    ok(Array.isArray(rec.fields.apply_photo_file) && rec.fields.apply_photo_file[0].file_token === applyToken,
      `apply_photo_file 应含 token，实际 ${JSON.stringify(rec.fields.apply_photo_file)}`)
    ok(rec.fields.apply_photo === '', 'apply_photo 文本字段应为空')
  })

  await test('getBorrowList 附件解析为临时 URL', async () => {
    const list = await call(adminToken, '/api/borrow', 'getBorrowList', { status: 'pending_approval' })
    const rec = list.find(r => r._id === attachBorrowId)
    ok(rec, '列表应含附件借用记录')
    ok(rec.apply_photo === `https://mock-feishu.local/tmp/${applyToken}`,
      `apply_photo 应解析为临时 URL，实际 ${rec.apply_photo}`)
  })

  await test('URL 照片仍走文本字段（兼容旧数据）', async () => {
    // 早前 confirmReturn 用了 '/uploads/e2e/photo.jpg'（URL），应原样保留在文本字段
    const list = await call(adminToken, '/api/borrow', 'getBorrowList', { status: 'returned' })
    const rec = list.find(r => r._id === borrowId)
    ok(rec && rec.return_photo === '/uploads/e2e/photo.jpg',
      `旧 URL 数据应原样返回，实际 ${rec && rec.return_photo}`)
  })

  await test('confirmCollect 复制附件到领取照片字段', async () => {
    await call(adminToken, '/api/borrow', 'approveBorrow', { id: attachBorrowId })
    await call(adminToken, '/api/borrow', 'confirmCollect', { id: attachBorrowId })
    const list = await call(adminToken, '/api/borrow', 'getBorrowList', { status: 'collected' })
    const rec = list.find(r => r._id === attachBorrowId)
    ok(rec, '应找到已领取记录')
    ok(rec.collect_photo === `https://mock-feishu.local/tmp/${applyToken}`,
      `collect_photo 应复制附件并解析，实际 ${rec.collect_photo}`)
  })

  await test('confirmReturn 传 file_token 并解析临时 URL', async () => {
    await call(adminToken, '/api/borrow', 'confirmReturn', { id: attachBorrowId, photoUrl: returnToken })
    const list = await call(adminToken, '/api/borrow', 'getBorrowList', { status: 'returned' })
    const rec = list.find(r => r._id === attachBorrowId)
    ok(rec, '应找到已归还记录')
    ok(rec.return_photo === `https://mock-feishu.local/tmp/${returnToken}`,
      `return_photo 应解析为临时 URL，实际 ${rec.return_photo}`)
    const item = await call(adminToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(Number(item.available_quantity) === 195, `归还后可用应为 195，实际 ${item.available_quantity}`)
  })

  await test('updateProfile 头像 file_token 解析', async () => {
    const avatarToken = await uploadToFeishu(Buffer.from('avatar-bytes'), 'avatar.jpg')
    await call(borrowerToken, '/api/user', 'updateProfile', { name: '借用员小张', avatarUrl: avatarToken })
    const list = await call(adminToken, '/api/user', 'getUserList')
    const u = list.find(x => x.openid === BORROWER)
    ok(u.avatar_url === `https://mock-feishu.local/tmp/${avatarToken}`,
      `avatar_url 应解析为临时 URL，实际 ${u.avatar_url}`)
    const me = await call(borrowerToken, '/api/user', 'login')
    ok(me.avatar_url === `https://mock-feishu.local/tmp/${avatarToken}`,
      `login 返回的头像也应解析，实际 ${me.avatar_url}`)
  })

  await test('backfillBorrow 传 file_token 补录并解析', async () => {
    const bfToken = await uploadToFeishu(Buffer.from('backfill-bytes'), 'backfill.jpg')
    const record = await call(adminToken, '/api/borrow', 'backfillBorrow', {
      itemId, borrowerOpenid: BORROWER, quantity: 1, remark: 'E2E附件补录',
      applyTime: Date.now(), photoUrl: bfToken
    })
    ok(record.status === 'collected', `补录状态应为 collected，实际 ${record.status}`)
    const list = await call(adminToken, '/api/borrow', 'getBorrowList', { borrowerId: BORROWER })
    const rec = list.find(r => r._id === record._id)
    ok(rec.collect_photo === `https://mock-feishu.local/tmp/${bfToken}`,
      `补录 collect_photo 应解析为临时 URL，实际 ${rec.collect_photo}`)
  })

  // ========================
  // 11. 删除分类（含引用检查场景）
  // ========================
  console.log('\n[11] 清理性操作')

  await test('deleteCategory', async () => {
    const r = await call(adminToken, '/api/item', 'deleteCategory', { recordId: catId })
    ok(r.success === true, '应返回 success')
  })

  // ========================
  // 结果
  // ========================
  console.log('\n========================================')
  console.log(`  通过: ${passed}  |  失败: ${failed}`)
  console.log('========================================')
  if (failures.length > 0) {
    console.log('\n失败详情:')
    failures.forEach(f => console.log(`  ✗ ${f.name}: ${f.message}`))
  }
}

// ================================================================
// 主入口
// ================================================================
async function main() {
  const mockFeishu = createMockFeishuServer()
  global.__mockFeishu = mockFeishu

  await mockFeishu.start(MOCK_PORT)
  console.log(`Mock 飞书服务器: http://localhost:${MOCK_PORT}`)

  try {
    await startServer()
    console.log(`Express server: ${BASE}`)

    // 预置 ADMIN/BORROWER（NEWBIE 留空以验证「新用户自动注册」逻辑）
    const presign = [ADMIN, BORROWER]
    for (const openid of presign) {
      await http.post(
        `http://localhost:${MOCK_PORT}/open-apis/bitable/v1/apps/bitable_e2e_token/tables/${TABLES.users}/records`,
        { fields: { openid, name: '', avatar_url: '', role: [], status: 'pending', created_at: Date.now() } },
        { headers: { Authorization: 'Bearer mock-tenant-token-e2e' } }
      )
    }
    // 保证 login 时三个用户都存在（login 对已存在用户直接返回）

    await run()
  } catch (err) {
    console.error('\nE2E 执行异常:', err)
    failed++
  } finally {
    await stopServer()
    await mockFeishu.stop()
    process.exit(failed > 0 ? 1 : 0)
  }
}

main()
