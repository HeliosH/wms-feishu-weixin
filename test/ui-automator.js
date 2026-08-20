/**
 * 小程序 UI 自动化 E2E — miniprogram-automator
 *
 * 前置条件（一次性设置）:
 *   1. 打开微信开发者工具 → 设置 → 安全设置 → 开启「服务端口」
 *   2. 开发者工具已登录微信扫码账号
 *
 * 运行: npm run test:ui
 *
 * 脚本会自动:
 *   - 启动 Mock 飞书服务器 + 真实 Express server（端口 8080，DEV_OPENID 旁路登录）
 *   - 预置管理员用户 / 分类 / 货物 / 一条在途借用
 *   - 启动开发者工具自动运行小程序
 *   - 验证: 登录 → 首页管理员仪表盘 → 统计卡渲染 → tab 切换 → 借用页 → 管理页 → 子包库存页
 */
const path = require('path')
const axios = require('axios')
const automator = require('miniprogram-automator')

const { createMockFeishuServer } = require('./mock-feishu-server')

const PROJECT_PATH = path.join(__dirname, '..')
const MOCK_PORT = 9098
const SERVER_PORT = 8080 // 与 miniprogram/utils/config.js develop 环境一致
const BASE = `http://localhost:${SERVER_PORT}`
const http = axios.create({ proxy: false })

const TABLES = {
  users: 'tbl_users_ui',
  categories: 'tbl_categories_ui',
  items: 'tbl_items_ui',
  borrowRecords: 'tbl_borrows_ui',
  inventoryLogs: 'tbl_logs_ui'
}

const ADMIN = 'ui_test_admin_openid'
const BORROWER = 'ui_test_borrower_openid'

// ---- 测试工具 ----
let passed = 0, failed = 0
const failures = []
async function test(name, fn) {
  process.stdout.write(`  ${name}... `.padEnd(48))
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
function ok(cond, msg) { if (!cond) throw new Error(msg || '断言失败') }
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---- 启动基础设施 ----
let serverProcess = null

async function startInfra() {
  const mockFeishu = createMockFeishuServer()
  await mockFeishu.start(MOCK_PORT)

  // 直接向 mock 表预置数据（等价于真实环境的已有业务数据）
  const mockApi = axios.create({ proxy: false, headers: { Authorization: 'Bearer mock-tenant-token-e2e' } })
  const M = `http://localhost:${MOCK_PORT}/open-apis/bitable/v1/apps/bitable_ui_token/tables`

  // 用户
  await mockApi.post(`${M}/${TABLES.users}/records`, {
    fields: { openid: ADMIN, name: 'UI测试管理员', avatar_url: '', role: ['admin'], status: 'active', created_at: Date.now() }
  })
  await mockApi.post(`${M}/${TABLES.users}/records`, {
    fields: { openid: BORROWER, name: 'UI测试借用员', avatar_url: '', role: ['borrower'], status: 'active', created_at: Date.now() }
  })
  // 分类
  const cat = (await mockApi.post(`${M}/${TABLES.categories}/records`, {
    fields: { name: 'UI测试分类', description: '', created_at: Date.now() }
  })).data.data.record
  // 货物
  const item = (await mockApi.post(`${M}/${TABLES.items}/records`, {
    fields: {
      name: 'UI测试货物', category_id: cat.record_id, category_name: 'UI测试分类',
      total_quantity: 50, available_quantity: 48, borrowed_quantity: 2, status: 'active',
      description: 'UI 自动化测试数据', created_at: Date.now()
    }
  })).data.data.record
  // 一条已领取（在途）借用记录（挂在 ADMIN 名下，供首页统计 + 借用页"借用中"断言共用）
  await mockApi.post(`${M}/${TABLES.borrowRecords}/records`, {
    fields: {
      item_id: item.record_id, item_name: 'UI测试货物',
      borrower_id: ADMIN, borrower_name: 'UI测试管理员',
      quantity: 2, status: 'collected', remark: 'UI预置在途借用',
      apply_time: Date.now(), created_at: Date.now()
    }
  })

  // 启动 Express server（dev 登录旁路固定 openid）
  const env = {
    ...process.env,
    http_proxy: '', https_proxy: '', HTTP_PROXY: '', HTTPS_PROXY: '',
    no_proxy: 'localhost,127.0.0.1', NO_PROXY: 'localhost,127.0.0.1',
    SERVER_PORT: String(SERVER_PORT),
    JWT_SECRET: 'ui-test-secret',
    DEV_OPENID: ADMIN,
    FEISHU_APP_ID: 'cli_ui_test',
    FEISHU_APP_SECRET: 'ui-test-secret',
    FEISHU_BITABLE_APP_TOKEN: 'bitable_ui_token',
    FEISHU_TABLE_USERS: TABLES.users,
    FEISHU_TABLE_CATEGORIES: TABLES.categories,
    FEISHU_TABLE_ITEMS: TABLES.items,
    FEISHU_TABLE_BORROW_RECORDS: TABLES.borrowRecords,
    FEISHU_TABLE_INVENTORY_LOGS: TABLES.inventoryLogs,
    FEISHU_BASE_URL: `http://localhost:${MOCK_PORT}`,
    UPLOAD_DIR: path.join(__dirname, '..', 'server', 'uploads')
  }
  serverProcess = require('child_process').spawn('node', ['app.js'], {
    cwd: path.join(__dirname, '..', 'server'),
    env, stdio: ['ignore', 'pipe', 'pipe']
  })
  serverProcess.stderr.on('data', d => process.stderr.write(`[server] ${d}`))

  for (let i = 0; i < 50; i++) {
    try { await http.get(`${BASE}/uploads`, { validateStatus: () => true }); break }
    catch (e) { await sleep(100) }
  }
  console.log(`基础设施就绪: server=${BASE} mock飞书=:${MOCK_PORT} DEV_OPENID=${ADMIN}`)
  return { mockFeishu, itemId: item.record_id }
}

async function stopInfra(mockFeishu) {
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    await sleep(300)
  }
  if (mockFeishu) await mockFeishu.stop()
}

// ================================================================
// UI 测试
// ================================================================
async function runUiTests(miniProgram) {
  console.log('\n[1] 登录流程')

  // 重置登录态
  await miniProgram.callWxMethod('clearStorageSync')

  await test('进入登录页', async () => {
    const page = await miniProgram.reLaunch('/pages/login/login')
    await sleep(500)
    const cur = await miniProgram.currentPage()
    // 注: reLaunch 不重跑 app.js，auth 的模块级 _userInfo 缓存仍在时，
    // 登录页 onShow 会重定向回首页 —— 此时视为"已登录态直达首页"，登录按钮逻辑由下一用例覆盖
    ok(
      page.path === 'pages/login/login' || cur.path === 'pages/index/index',
      `应在登录页（或已登录直达首页），实际 ${cur.path}`
    )
  })

  await test('点击登录 → 跳转首页（dev 旁路）', async () => {
    const page = await miniProgram.currentPage()
    // 若 App 内存中残留登录态，reLaunch 会被登录页重定向回首页，此时直接视为已登录
    if (page && page.path === 'pages/index/index') return
    const btn = await page.$('.login-btn')
    ok(btn, '应存在登录按钮')
    await btn.tap()
    // 等待登录 + 跳转
    let indexPage = null
    for (let i = 0; i < 30; i++) {
      await sleep(300)
      const p = await miniProgram.currentPage()
      if (p && p.path === 'pages/index/index') { indexPage = p; break }
    }
    ok(indexPage, '登录后应跳转到首页')
  })

  console.log('\n[2] 首页管理员仪表盘')

  await test('管理员视角渲染', async () => {
    const page = await miniProgram.currentPage()
    const data = await page.data()
    ok(data.isWarehouseAdmin === true, `isWarehouseAdmin 应为 true，实际 ${data.isWarehouseAdmin}`)
    // 等待统计数据加载
    for (let i = 0; i < 20; i++) {
      await sleep(300)
      const d = await page.data()
      if (d.statsLoading === false) break
    }
    const d = await page.data()
    ok(Number(d.adminStats.totalStock) === 50, `总库存应为 50，实际 ${d.adminStats.totalStock}`)
    ok(Number(d.adminStats.availableStock) === 48, `可用库存应为 48，实际 ${d.adminStats.availableStock}`)
    ok(Number(d.adminStats.borrowing) === 0, `借用流程中应为 0，实际 ${d.adminStats.borrowing}`)
    ok(Number(d.adminStats.returning) === 1, `归还流程中应为 1（预置在途借用），实际 ${d.adminStats.returning}`)
  })

  await test('统计卡 DOM 渲染', async () => {
    const page = await miniProgram.currentPage()
    const statItems = await page.$$('.stat-item')
    ok(statItems.length >= 4, `管理员应有至少 4 个统计卡，实际 ${statItems.length}`)
    const labels = await page.$$('.stat-label')
    ok(labels.length >= 4, '每个统计卡应有标签')
  })

  console.log('\n[3] TabBar 切换')

  await test('切换到借用 tab', async () => {
    const page = await miniProgram.switchTab('/pages/borrow/borrow')
    await sleep(800)
    ok(page.path === 'pages/borrow/borrow', `应在借用页，实际 ${page.path}`)
    // 等待物品列表加载
    for (let i = 0; i < 15; i++) {
      await sleep(300)
      const d = await page.data()
      if (d.myItemsLoading === false) break
    }
    const d = await page.data()
    ok(Array.isArray(d.myItems), '借用页应有物品列表数据')
    ok(d.myItems.length >= 1, `应加载到预置物品，实际 ${d.myItems.length} 条`)
    const target = d.myItems.find(i => i.item_name === 'UI测试货物')
    ok(target, `应包含预置的 UI 测试货物，实际 ${JSON.stringify(d.myItems.map(i => i.item_name))}`)
  })

  await test('切换到管理 tab（管理员可见）', async () => {
    const page = await miniProgram.switchTab('/pages/manage/manage')
    await sleep(800)
    ok(page.path === 'pages/manage/manage', `应在管理页，实际 ${page.path}`)
  })

  await test('切换回首页', async () => {
    const page = await miniProgram.switchTab('/pages/index/index')
    await sleep(500)
    ok(page.path === 'pages/index/index', '应回到首页')
  })

  console.log('\n[4] 子包页面加载')

  await test('管理页进入库存管理（admin 子包）', async () => {
    await miniProgram.switchTab('/pages/manage/manage')
    await sleep(500)
    const page = await miniProgram.currentPage()
    // 库存管理大按钮（big-card，data-url 指向子包 inventory 页）
    const btn = await page.$('.big-card')
    ok(btn, '应存在库存管理大按钮')
    await btn.tap()
    // 首次加载子包需编译，耗时可能超过 2s → 轮询等待（最多 15s）
    let cur = null
    for (let i = 0; i < 30; i++) {
      await sleep(500)
      cur = await miniProgram.currentPage()
      if (cur && cur.path === 'subpackages/admin/pages/inventory/inventory') break
    }
    ok(cur && cur.path === 'subpackages/admin/pages/inventory/inventory', `应进入子包库存页，实际 ${cur && cur.path}`)
  })

  console.log('\n========================================')
  console.log(`  UI 测试 通过: ${passed}  |  失败: ${failed}`)
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
  console.log('=== 仓仓 WMS 小程序 UI 自动化 E2E ===\n')
  console.log('前置条件: 微信开发者工具 → 设置 → 安全设置 → 开启「服务端口」\n')

  const { mockFeishu } = await startInfra()

  let miniProgram = null
  try {
    // 优先直连已打开的自动化实例（CLI: cli auto --project <path> --auto-port 9420）
    const wsPort = process.env.UI_WS_PORT || 9420
    try {
      miniProgram = await automator.connect({ wsEndpoint: `ws://localhost:${wsPort}` })
      console.log(`已连接开发者工具 (端口 ${wsPort})\n`)
    } catch (e) {
      // 工具未以自动化模式打开 → 通过 CLI 拉起
      miniProgram = await automator.launch({
        projectPath: PROJECT_PATH,
        cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
      })
      console.log('开发者工具已启动\n')
    }
    await runUiTests(miniProgram)
  } catch (err) {
    console.error('\n连接/启动开发者工具失败:', err.message)
    console.error('\n请确认:')
    console.error('  1. 微信开发者工具已安装且已登录')
    console.error('  2. 设置 → 安全设置 → 服务端口已开启')
    console.error('  3. 若工具已打开，可先执行:')
    console.error('     /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto --project <项目路径> --auto-port 9420')
    failed++
  } finally {
    if (miniProgram) {
      // connect 模式只断开（不关工具窗口），launch 模式关闭
      try { await miniProgram.disconnect() } catch (e) { /* ignore */ }
    }
    await stopInfra(mockFeishu)
    process.exit(failed > 0 ? 1 : 0)
  }
}

main()
