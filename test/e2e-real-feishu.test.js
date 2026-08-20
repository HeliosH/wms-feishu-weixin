/**
 * 真实环境 E2E 测试 — 真实 Express server + 真实飞书多维表格
 *
 * 架构: [测试脚本] --HTTP--> [真实 Express server] --HTTPS--> [飞书 open.feishu.cn]
 *
 * 与 e2e-server.test.js（mock 飞书）互补，本测试验证：
 *   - 真实飞书凭证 / 表 ID / 字段类型（数组字段 role、数字字段、null 清空等）
 *   - 真实飞书 filter 语法（CurrentValue.[field]="value"）
 *   - 借用全生命周期在真实数据源上的状态机与库存一致性
 *
 * 数据安全:
 *   - 所有测试数据使用唯一标记（REAL_E2E_ + 时间戳 前缀）
 *   - 测试结束（无论成败）直接通过飞书 API 清理全部测试记录
 *
 * 运行前: server/.env 需配置真实凭证
 * 运行: npm run test:real
 */
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const https = require('https')
const jwt = require('jsonwebtoken')
const axios = require('axios')
// 本地 server 直连不走代理；真实飞书请求由 server 子进程直连发出（已验证可行）
const http = axios.create({ proxy: false })

// ---- 读取 server/.env 真实配置 ----
function loadEnv(file) {
  const env = {}
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    if (line.trim().startsWith('#')) continue
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}
const ENV = loadEnv(path.join(__dirname, '..', 'server', '.env'))

const SERVER_PORT = 9099
const BASE = `http://localhost:${SERVER_PORT}`
const JWT_SECRET = ENV.JWT_SECRET

const APP_TOKEN = ENV.FEISHU_BITABLE_APP_TOKEN
const TABLES = {
  users: ENV.FEISHU_TABLE_USERS,
  categories: ENV.FEISHU_TABLE_CATEGORIES,
  items: ENV.FEISHU_TABLE_ITEMS,
  borrowRecords: ENV.FEISHU_TABLE_BORROW_RECORDS,
  inventoryLogs: ENV.FEISHU_TABLE_INVENTORY_LOGS
}

// ---- 测试数据唯一标记 ----
const TS = Date.now()
const MARK = `REAL_E2E_${TS}`
const ADMIN_OPENID = `${MARK}_admin`
const BORROWER_OPENID = `${MARK}_borrower`
const NEWBIE_OPENID = `${MARK}_newbie`
const CAT_NAME = `测试分类-${MARK}`
const ITEM_NAME = `测试货物-${MARK}`

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

function sign(openid, expiresIn = '1h') {
  return jwt.sign({ openid }, JWT_SECRET, { expiresIn })
}

async function api(token, route, body) {
  const res = await http.post(`${BASE}${route}`, body, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true
  })
  return { status: res.status, data: res.data }
}

async function call(token, route, action, params = {}) {
  const { status, data } = await api(token, route, { action, ...params })
  if (status !== 200 || data.code !== 0) {
    throw new Error(`${action} 失败: HTTP ${status} ${data && data.message}`)
  }
  return data.data
}

// ================================================================
// 直连飞书 API（引导测试用户 + 清理测试数据）
// ================================================================
let feishuToken = ''

function feishuRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://open.feishu.cn')
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${feishuToken}`
      }
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve(JSON.parse(d)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function getFeishuToken() {
  const data = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ app_id: ENV.FEISHU_APP_ID, app_secret: ENV.FEISHU_APP_SECRET })
    const url = new URL('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal')
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(JSON.parse(d)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
  if (data.code !== 0) throw new Error(`飞书 token 获取失败: ${data.msg}`)
  feishuToken = data.tenant_access_token
}

async function feishuList(tableId, filter) {
  const params = new URLSearchParams({ page_size: '500' })
  if (filter) params.set('filter', filter)
  const res = await feishuRequest('GET',
    `/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records?${params}`)
  if (res.code !== 0) throw new Error(`飞书查询失败: ${res.msg}`)
  return res.data.items || []
}

async function feishuUpdate(tableId, recordId, fields) {
  const res = await feishuRequest('PUT',
    `/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/${recordId}`,
    { fields })
  if (res.code !== 0) throw new Error(`飞书更新失败: ${res.msg}`)
}

async function feishuDelete(tableId, recordId) {
  const res = await feishuRequest('DELETE',
    `/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/${recordId}`)
  if (res.code !== 0) throw new Error(`飞书删除失败: ${res.msg}`)
}

// 引导测试用户：直接改飞书 users 表设置角色/状态（模拟线下管理员初始化）
async function bootstrapUser(openid, role, status) {
  const items = await feishuList(TABLES.users, `CurrentValue.[openid]="${openid}"`)
  if (items.length === 0) throw new Error(`引导失败: 用户 ${openid} 不存在`)
  await feishuUpdate(TABLES.users, items[0].record_id, { role, status })
}

// 清理所有带本次标记的数据
async function cleanup() {
  console.log('\n--- 清理测试数据 ---')
  let deleted = 0
  const targets = [
    [TABLES.borrowRecords, `CurrentValue.[borrower_id]="${BORROWER_OPENID}"`],
    [TABLES.inventoryLogs, `CurrentValue.[item_id]="${__itemId || ''}"`],
    [TABLES.items, `CurrentValue.[name]="${ITEM_NAME}"`],
    [TABLES.categories, `CurrentValue.[name]="${CAT_NAME}"`],
    [TABLES.users, `CurrentValue.[openid]="${ADMIN_OPENID}"`],
    [TABLES.users, `CurrentValue.[openid]="${BORROWER_OPENID}"`],
    [TABLES.users, `CurrentValue.[openid]="${NEWBIE_OPENID}"`]
  ]
  for (const [tableId, filter] of targets) {
    try {
      const items = await feishuList(tableId, filter)
      for (const it of items) {
        await feishuDelete(tableId, it.record_id)
        deleted++
      }
    } catch (e) {
      console.log(`  清理失败(${filter}): ${e.message}`)
    }
  }
  console.log(`  已删除 ${deleted} 条测试记录`)
}

// ================================================================
// 启动 / 停止真实 server
// ================================================================
let serverProcess = null
let __itemId = null // 测试创建的 item record_id，供清理 inventory logs

async function startServer() {
  const env = {
    ...process.env,
    // 飞书是外网 HTTPS，直连（test:api 已验证直连可行）
    http_proxy: '', https_proxy: '', HTTP_PROXY: '', HTTPS_PROXY: '',
    SERVER_PORT: String(SERVER_PORT),
    JWT_SECRET: ENV.JWT_SECRET,
    WX_APPID: ENV.WX_APPID,
    WX_APPSECRET: ENV.WX_APPSECRET,
    FEISHU_APP_ID: ENV.FEISHU_APP_ID,
    FEISHU_APP_SECRET: ENV.FEISHU_APP_SECRET,
    FEISHU_BITABLE_APP_TOKEN: ENV.FEISHU_BITABLE_APP_TOKEN,
    FEISHU_TABLE_USERS: TABLES.users,
    FEISHU_TABLE_CATEGORIES: TABLES.categories,
    FEISHU_TABLE_ITEMS: TABLES.items,
    FEISHU_TABLE_BORROW_RECORDS: TABLES.borrowRecords,
    FEISHU_TABLE_INVENTORY_LOGS: TABLES.inventoryLogs,
    UPLOAD_DIR: path.join(__dirname, '..', 'server', 'uploads')
  }
  delete env.FEISHU_BASE_URL
  delete env.DEV_OPENID

  serverProcess = spawn('node', ['app.js'], {
    cwd: path.join(__dirname, '..', 'server'),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  serverProcess.stdout.on('data', d => process.stdout.write(`[server] ${d}`))
  serverProcess.stderr.on('data', d => process.stderr.write(`[server] ${d}`))

  for (let i = 0; i < 50; i++) {
    try {
      await http.get(`${BASE}/uploads`, { validateStatus: () => true })
      return
    } catch (e) {
      await new Promise(r => setTimeout(r, 100))
    }
  }
  throw new Error('server 启动超时')
}

function stopServer() {
  if (serverProcess) serverProcess.kill()
}

// ================================================================
// 测试主体
// ================================================================
async function main() {
  console.log('=== 真实环境 E2E 测试（真实飞书多维表格）===')
  console.log(`标记: ${MARK}\n`)

  let adminToken = '', borrowerToken = '', newbieToken = ''
  let catId = '', catTempId = '', itemId = ''
  let applyRec1 = '', applyRec2 = ''

  try {
    await getFeishuToken()
    console.log('飞书 token: OK\n')
    await startServer()
    console.log('server 启动: OK\n')
  } catch (err) {
    console.error('环境准备失败:', err.message)
    process.exit(1)
  }

  console.log('[鉴权]')
  await test('无效 token 应返回 401', async () => {
    const { status } = await api('invalid-token', '/api/user', { action: 'getUserList' })
    ok(status === 401, `期望 401，实际 ${status}`)
  })
  await test('过期 token 应返回 401', async () => {
    const expired = sign(ADMIN_OPENID, -1)
    const { status } = await api(expired, '/api/user', { action: 'getUserList' })
    ok(status === 401, `期望 401，实际 ${status}`)
  })
  await test('/api/auth/login 缺少 code 报错', async () => {
    const { data } = await api(null, '/api/auth/login', {})
    ok(data.code !== 0, '应该报错')
  })

  console.log('\n[用户体系]')
  await test('管理员首次 login 自动建档 (pending)', async () => {
    adminToken = sign(ADMIN_OPENID)
    const user = await call(adminToken, '/api/user', 'login')
    ok(user.openid === ADMIN_OPENID, 'openid 不匹配')
    ok(user.status === 'pending', `期望 pending，实际 ${user.status}`)
  })
  await test('引导管理员角色 (直接写飞书)', async () => {
    await bootstrapUser(ADMIN_OPENID, ['admin'], 'active')
    const user = await call(adminToken, '/api/user', 'login')
    const roles = Array.isArray(user.role) ? user.role : [user.role]
    ok(roles.includes('admin'), '管理员角色未生效')
  })
  await test('借用者首次 login 自动建档', async () => {
    borrowerToken = sign(BORROWER_OPENID)
    const user = await call(borrowerToken, '/api/user', 'login')
    ok(user.status === 'pending', `期望 pending，实际 ${user.status}`)
  })
  await test('借用者提交借用资格申请', async () => {
    await call(borrowerToken, '/api/user', 'applyRole', { name: `测试借用人${TS}` })
    const user = await call(borrowerToken, '/api/user', 'login')
    ok(user.status === 'pending_review', `期望 pending_review，实际 ${user.status}`)
  })
  await test('管理员审批通过借用资格', async () => {
    await call(adminToken, '/api/user', 'approveRole', {
      openid: BORROWER_OPENID, approved: true, role: ['borrower']
    })
    const user = await call(borrowerToken, '/api/user', 'login')
    const roles = Array.isArray(user.role) ? user.role : [user.role]
    ok(user.status === 'active', `期望 active，实际 ${user.status}`)
    ok(roles.includes('borrower'), '借用者角色未生效')
  })
  await test('重复申请资格被拒绝', async () => {
    newbieToken = sign(NEWBIE_OPENID)
    await call(newbieToken, '/api/user', 'login')
    await call(newbieToken, '/api/user', 'applyRole', { name: `新人${TS}` })
    let err = null
    try { await call(newbieToken, '/api/user', 'applyRole', { name: 'again' }) } catch (e) { err = e }
    ok(err && err.message.includes('已有待审批的申请'), `期望重复申请报错，实际: ${err && err.message}`)
  })
  await test('管理员 getUserList 包含测试用户', async () => {
    const list = await call(adminToken, '/api/user', 'getUserList')
    const openids = list.map(u => u.openid)
    ok(openids.includes(ADMIN_OPENID) && openids.includes(BORROWER_OPENID), '测试用户未在列表中')
  })
  await test('updateProfile 修改昵称', async () => {
    const user = await call(borrowerToken, '/api/user', 'updateProfile', { name: `改名借用人${TS}` })
    ok(user.name === `改名借用人${TS}`, '昵称未更新')
  })

  console.log('\n[分类与货物]')
  await test('管理员创建分类', async () => {
    const cat = await call(adminToken, '/api/item', 'createCategory', {
      name: CAT_NAME, description: '真实E2E分类'
    })
    catId = cat._id
    ok(!!catId, '未返回 record_id')
  })
  await test('创建临时分类并更新/删除', async () => {
    const tmp = await call(adminToken, '/api/item', 'createCategory', {
      name: `临时分类-${MARK}`, description: ''
    })
    catTempId = tmp._id
    const upd = await call(adminToken, '/api/item', 'updateCategory', {
      recordId: catTempId, name: `临时分类改名-${MARK}`
    })
    ok(upd.name === `临时分类改名-${MARK}`, '分类名未更新')
    await call(adminToken, '/api/item', 'deleteCategory', { recordId: catTempId })
  })
  await test('管理员创建货物 (总量10)', async () => {
    const item = await call(adminToken, '/api/item', 'createItem', {
      name: ITEM_NAME, categoryId: catId, categoryName: CAT_NAME,
      totalQuantity: 10, description: '真实E2E货物'
    })
    itemId = item._id
    __itemId = itemId
    ok(Number(item.available_quantity) === 10, `期望可用10，实际 ${item.available_quantity}`)
  })
  await test('getItemList 按分类筛选', async () => {
    const list = await call(adminToken, '/api/item', 'getItemList', { categoryId: catId })
    const names = list.map(i => i.name)
    ok(names.includes(ITEM_NAME), '按分类筛选未找到测试货物')
  })
  await test('updateItem 修改货物名称', async () => {
    const item = await call(adminToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(item.name === ITEM_NAME, '货物详情不匹配')
  })

  console.log('\n[借用全生命周期]')
  await test('借用者提交申请 (3件) → pending_approval', async () => {
    const rec = await call(borrowerToken, '/api/borrow', 'applyBorrow', {
      itemId, quantity: 3, remark: '真实E2E申请1'
    })
    applyRec1 = rec._id
    ok(rec.status === 'pending_approval', `期望 pending_approval，实际 ${rec.status}`)
  })
  await test('借用者提交第二笔申请 (2件) 用于驳回', async () => {
    const rec = await call(borrowerToken, '/api/borrow', 'applyBorrow', {
      itemId, quantity: 2, remark: '真实E2E申请2'
    })
    applyRec2 = rec._id
    ok(rec.status === 'pending_approval', `期望 pending_approval，实际 ${rec.status}`)
  })
  await test('getBorrowList 按状态+借用人筛选 (真实飞书 filter)', async () => {
    const list = await call(adminToken, '/api/borrow', 'getBorrowList', {
      status: 'pending_approval', borrowerId: BORROWER_OPENID
    })
    ok(list.length === 2, `期望 2 条待审批，实际 ${list.length}`)
  })
  await test('驳回第二笔申请 → rejected', async () => {
    const rec = await call(adminToken, '/api/borrow', 'rejectBorrow', {
      id: applyRec2, reason: '测试驳回'
    })
    ok(rec.status === 'rejected', `期望 rejected，实际 ${rec.status}`)
    ok(rec.reject_reason === '测试驳回', '驳回原因未写入')
  })
  await test('驳回后不能重复审批 (状态机校验)', async () => {
    let err = null
    try { await call(adminToken, '/api/borrow', 'approveBorrow', { id: applyRec2 }) } catch (e) { err = e }
    ok(err && err.message.includes('不在待审批状态'), `期望状态机报错，实际: ${err && err.message}`)
  })
  await test('审批通过第一笔 → approved + 库存扣减', async () => {
    const rec = await call(adminToken, '/api/borrow', 'approveBorrow', { id: applyRec1 })
    ok(rec.status === 'approved', `期望 approved，实际 ${rec.status}`)
    const item = await call(adminToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(Number(item.available_quantity) === 7, `期望可用7，实际 ${item.available_quantity}`)
    ok(Number(item.borrowed_quantity) === 3, `期望借出3，实际 ${item.borrowed_quantity}`)
  })
  await test('确认领取 → collected', async () => {
    const rec = await call(adminToken, '/api/borrow', 'confirmCollect', { id: applyRec1 })
    ok(rec.status === 'collected', `期望 collected，实际 ${rec.status}`)
    ok(!!rec.collect_time, '领取时间未写入')
  })
  await test('库存不足申请被拒 (可用7 申8)', async () => {
    let err = null
    try {
      await call(borrowerToken, '/api/borrow', 'applyBorrow', { itemId, quantity: 8 })
    } catch (e) { err = e }
    ok(err && err.message.includes('库存不足'), `期望库存不足报错，实际: ${err && err.message}`)
  })
  await test('确认归还 → returned + 库存恢复', async () => {
    const rec = await call(adminToken, '/api/borrow', 'confirmReturn', { id: applyRec1 })
    ok(rec.status === 'returned', `期望 returned，实际 ${rec.status}`)
    const item = await call(adminToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(Number(item.available_quantity) === 10, `期望可用10，实际 ${item.available_quantity}`)
    ok(Number(item.borrowed_quantity) === 0, `期望借出0，实际 ${item.borrowed_quantity}`)
  })

  console.log('\n[补录与库存调整]')
  await test('管理员补录借出 (2件) → collected', async () => {
    const rec = await call(adminToken, '/api/borrow', 'backfillBorrow', {
      itemId, borrowerOpenid: BORROWER_OPENID, quantity: 2, remark: '补录测试'
    })
    ok(rec.status === 'collected', `期望 collected，实际 ${rec.status}`)
    const item = await call(adminToken, '/api/item', 'getItemDetail', { id: itemId })
    ok(Number(item.available_quantity) === 8, `期望可用8，实际 ${item.available_quantity}`)
  })
  await test('getItemBorrowers 查询在借人员', async () => {
    const borrowers = await call(adminToken, '/api/item', 'getItemBorrowers', { itemId })
    ok(borrowers.length === 1, `期望 1 条在借记录，实际 ${borrowers.length}`)
    ok(borrowers[0].borrower_id === BORROWER_OPENID, '借用人不匹配')
  })
  await test('adjustInventory 入库 +5 → 可用13', async () => {
    const r = await call(adminToken, '/api/item', 'adjustInventory', {
      itemId, changeType: 'stock_in', quantity: 5, reason: '真实E2E入库', operatorName: 'E2E管理员'
    })
    ok(r.afterQuantity === 13, `期望入库后13，实际 ${r.afterQuantity}`)
  })
  await test('getInventoryLogs 包含完整操作日志', async () => {
    const logs = await call(adminToken, '/api/item', 'getInventoryLogs', { itemId })
    const types = logs.map(l => l.change_type)
    ok(types.includes('borrow'), '缺少借出日志')
    ok(types.includes('return'), '缺少归还日志')
    ok(types.includes('stock_in'), '缺少入库日志')
  })

  console.log('\n[账号禁用]')
  await test('管理员禁用新人账号 → 再登录报错', async () => {
    await call(adminToken, '/api/user', 'toggleUserStatus', {
      openid: NEWBIE_OPENID, status: 'inactive'
    })
    let err = null
    try { await call(newbieToken, '/api/user', 'login') } catch (e) { err = e }
    ok(err && err.message.includes('禁用'), `期望禁用报错，实际: ${err && err.message}`)
  })
  await test('管理员账号不可禁用', async () => {
    let err = null
    try {
      await call(adminToken, '/api/user', 'toggleUserStatus', {
        openid: ADMIN_OPENID, status: 'inactive'
      })
    } catch (e) { err = e }
    ok(err && err.message.includes('不可禁用'), `期望不可禁用报错，实际: ${err && err.message}`)
  })

  // ================================================================
  // 收尾
  // ================================================================
  stopServer()
  await cleanup()

  console.log('\n========== 真实环境 E2E 结果 ==========')
  console.log(`通过: ${passed}  失败: ${failed}`)
  if (failures.length > 0) {
    console.log('\n失败项:')
    failures.forEach(f => console.log(`  ✗ ${f.name}\n    ${f.message}`))
    process.exit(1)
  }
  console.log('全部通过 ✓')
  process.exit(0)
}

// 异常退出也要尽量清理
process.on('exit', () => stopServer())

main().catch(async err => {
  console.error('\n测试执行异常:', err)
  stopServer()
  try { await cleanup() } catch (e) {}
  process.exit(1)
})
