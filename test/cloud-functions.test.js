/**
 * 云函数本地测试 — mock wx-server-sdk + mock 飞书服务器直调云函数入口
 *
 * 架构: [测试脚本] --require--> [真实云函数 index.js] --HTTP--> [Mock 飞书服务器(内存)]
 *
 * wx-server-sdk 通过 Module._resolveFilename 劫持替换为内存 mock，
 * 因此 applyBorrow / uploadPhoto / login 等全部走真实云函数代码路径，
 * 仅飞书侧与微信侧为模拟（与 test/e2e-server.test.js 同一套 mock 飞书）。
 *
 * 运行前置: node scripts/copy-common.js（保证各云函数 common 为最新）
 * 运行: npm run test:cloud
 */
const path = require('path')
const Module = require('module')

// ---- 劫持 wx-server-sdk（必须在 require 云函数之前完成） ----
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  if (request === 'wx-server-sdk') {
    return path.join(__dirname, 'mocks', 'wx-server-sdk.js')
  }
  return origResolve.call(this, request, ...args)
}

// ---- 环境变量（云函数读取飞书配置的优先级最高来源）----
const MOCK_PORT = 9099
process.env.FEISHU_BASE_URL = `http://localhost:${MOCK_PORT}`
process.env.FEISHU_APP_ID = 'cli_cf_test'
process.env.FEISHU_APP_SECRET = 'feishu-cf-secret'
process.env.FEISHU_BITABLE_APP_TOKEN = 'bitable_cf_token'
process.env.FEISHU_TABLE_USERS = 'tbl_users_cf'
process.env.FEISHU_TABLE_CATEGORIES = 'tbl_categories_cf'
process.env.FEISHU_TABLE_ITEMS = 'tbl_items_cf'
process.env.FEISHU_TABLE_BORROW_RECORDS = 'tbl_borrows_cf'
process.env.FEISHU_TABLE_INVENTORY_LOGS = 'tbl_logs_cf'
// 沙箱/本地代理环境兼容：云函数进程内 axios 直连 localhost
for (const k of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY']) process.env[k] = ''
process.env.no_proxy = 'localhost,127.0.0.1'

const { createMockFeishuServer } = require('./mock-feishu-server')

// ---- 加载云函数（在劫持与 env 就绪后）----
const userManage = require('../cloudfunctions/userManage/index.js')
const itemManage = require('../cloudfunctions/itemManage/index.js')
const borrowManage = require('../cloudfunctions/borrowManage/index.js')
const mockSdk = require('./mocks/wx-server-sdk.js')

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

// 云函数调用封装：断言响应契约 {code:0, data} / {code:-1, message}
async function call(fn, event) {
  const res = await fn.main(event)
  return res
}
async function okCall(fn, event) {
  const res = await call(fn, event)
  if (res.code !== 0) throw new Error(`${event.action} 失败: ${res.message}`)
  return res.data
}

// ---- 测试常量 ----
const ADMIN = 'cf_admin_openid'
const BORROWER = 'cf_borrower_openid'
const TABLES = {
  users: 'tbl_users_cf',
  borrowRecords: 'tbl_borrows_cf'
}

// ================================================================
// 用例
// ================================================================
async function run() {
  mockSdk.__state.openid = ADMIN

  console.log('\n[1] 响应契约')
  await test('未知 action 返回 code:-1', async () => {
    const res = await call(userManage, { action: 'notExist' })
    ok(res.code === -1 && typeof res.message === 'string', `实际: ${JSON.stringify(res)}`)
  })

  await test('uploadPhoto 缺少 fileID 返回 code:-1', async () => {
    const res = await call(borrowManage, { action: 'uploadPhoto' })
    ok(res.code === -1 && res.message.includes('缺少 fileID'), `实际: ${JSON.stringify(res)}`)
  })

  await test('uploadPhoto 云存储文件不存在返回 code:-1', async () => {
    const res = await call(borrowManage, { action: 'uploadPhoto', fileID: 'cloud://x/not-exist.jpg' })
    ok(res.code === -1, `实际: ${JSON.stringify(res)}`)
  })

  console.log('\n[2] 用户管理（userManage）')
  let adminUser
  await test('login 新用户自动注册', async () => {
    const u = await okCall(userManage, { action: 'login' })
    ok(u.status === 'pending', `新用户应为 pending，实际 ${u.status}`)
    adminUser = u
  })

  await test('OPENID 来自 WXContext（免 JWT）', async () => {
    // mock 飞书表中该记录的 openid 应等于 mock sdk 的 OPENID
    const mockFeishu = global.__mockFeishu
    const rec = mockFeishu.tables[TABLES.users].find(r => r.fields.openid === ADMIN)
    ok(rec, 'mock 飞书应有该用户记录')
  })

  await test('uploadPhoto 云存储→飞书附件 token', async () => {
    mockSdk.__state.cloudFiles.set('cloud://test/avatar.jpg', Buffer.from('cf-avatar-bytes'))
    const r = await okCall(userManage, {
      action: 'uploadPhoto', fileID: 'cloud://test/avatar.jpg', fileName: 'avatar.jpg'
    })
    ok(/^boxcn_mock_/.test(r.fileToken), `fileToken 应为 mock token，实际 ${r.fileToken}`)
    ok(r.url === `https://mock-feishu.local/tmp/${r.fileToken}`, `url 应为临时链接，实际 ${r.url}`)
    // mock 飞书应收到文件内容
    const mockFeishu = global.__mockFeishu
    ok(mockFeishu.media.has(r.fileToken), 'mock 飞书 media 应记录该 token')
    const stored = mockFeishu.media.get(r.fileToken)
    ok(stored.buffer.toString() === 'cf-avatar-bytes', '文件内容应一致')
    ok(stored.name === 'avatar.jpg', `文件名应一致，实际 ${stored.name}`)
  })

  await test('updateProfile 头像 token 写附件并解析临时 URL', async () => {
    // 先给管理员开权限（等同真实环境初始化）
    const mockFeishu = global.__mockFeishu
    const rec = mockFeishu.tables[TABLES.users].find(r => r.fields.openid === ADMIN)
    rec.fields.role = ['admin']
    rec.fields.status = 'active'

    mockSdk.__state.cloudFiles.set('cloud://test/avatar2.jpg', Buffer.from('cf-avatar-2'))
    const up = await okCall(userManage, {
      action: 'uploadPhoto', fileID: 'cloud://test/avatar2.jpg', fileName: 'avatar2.jpg'
    })
    await okCall(userManage, {
      action: 'updateProfile', name: 'CF管理员', avatarUrl: up.fileToken
    })
    const list = await okCall(userManage, { action: 'getUserList' })
    const u = list.find(x => x.openid === ADMIN)
    ok(u.avatar_url === `https://mock-feishu.local/tmp/${up.fileToken}`,
      `avatar_url 应解析为临时 URL，实际 ${u.avatar_url}`)
    ok(u.name === 'CF管理员', `name 应更新，实际 ${u.name}`)
  })

  console.log('\n[3] 货物管理（itemManage）')
  let catId, itemId
  await test('createCategory + createItem', async () => {
    const cat = await okCall(itemManage, { action: 'createCategory', name: 'CF分类', description: '' })
    ok(cat._id, '分类应有 _id')
    catId = cat._id
    const item = await okCall(itemManage, {
      action: 'createItem', name: 'CF货物', categoryId: catId, categoryName: 'CF分类',
      totalQuantity: 100, description: ''
    })
    ok(Number(item.available_quantity) === 100, `available 应为 100，实际 ${item.available_quantity}`)
    itemId = item._id
  })

  await test('adjustInventory 入库', async () => {
    const r = await okCall(itemManage, {
      action: 'adjustInventory', itemId, changeType: 'stock_in', quantity: 50,
      reason: 'CF入库', operatorName: 'CF管理员'
    })
    ok(r.afterQuantity === 150, `入库后应为 150，实际 ${r.afterQuantity}`)
  })

  console.log('\n[4] 借用全生命周期 + 附件照片（borrowManage）')
  let borrowId
  await test('uploadPhoto 用于借用申请照片', async () => {
    mockSdk.__state.cloudFiles.set('cloud://test/apply.jpg', Buffer.from('cf-apply-bytes'))
    const r = await okCall(borrowManage, {
      action: 'uploadPhoto', fileID: 'cloud://test/apply.jpg', fileName: 'apply.jpg'
    })
    borrowManage._applyToken = r.fileToken // 记录供后续用例使用
    ok(r.url.includes('mock-feishu.local'), '应返回临时预览 URL')
  })

  await test('applyBorrow（借用者身份 + 照片 token）', async () => {
    mockSdk.__state.openid = BORROWER
    // 借用者通过 userManage login 自动注册，再授角色（等同真实环境初始化）
    const newUser = await okCall(userManage, { action: 'login' })
    ok(newUser.openid === BORROWER, `新借用者应注册，实际 ${newUser.openid}`)
    const mockFeishu = global.__mockFeishu
    const rec = mockFeishu.tables[TABLES.users].find(r => r.fields.openid === BORROWER)
    rec.fields.role = ['borrower']
    rec.fields.status = 'active'

    const record = await okCall(borrowManage, {
      action: 'applyBorrow', itemId, quantity: 3, remark: 'CF借用',
      photoUrl: borrowManage._applyToken
    })
    ok(record.status === 'pending_approval', `状态应为 pending_approval，实际 ${record.status}`)
    borrowId = record._id
    // 附件字段应写入 file_token
    const mockFeishu2 = global.__mockFeishu
    const bRec = mockFeishu2.tables[TABLES.borrowRecords].find(r => r.record_id === borrowId)
    ok(Array.isArray(bRec.fields.apply_photo_file) &&
      bRec.fields.apply_photo_file[0].file_token === borrowManage._applyToken,
      'apply_photo_file 应含上传的 token')
  })

  await test('getBorrowList 附件解析为临时 URL', async () => {
    const list = await okCall(borrowManage, { action: 'getBorrowList', status: 'pending_approval' })
    const rec = list.find(r => r._id === borrowId)
    ok(rec, '列表应含该记录')
    ok(rec.apply_photo === `https://mock-feishu.local/tmp/${borrowManage._applyToken}`,
      `apply_photo 应解析为临时 URL，实际 ${rec.apply_photo}`)
  })

  await test('审批→领取→归还（附件复制与解析）', async () => {
    mockSdk.__state.openid = ADMIN
    await okCall(borrowManage, { action: 'approveBorrow', id: borrowId })
    await okCall(borrowManage, { action: 'confirmCollect', id: borrowId })

    // 归还照片：上传新云存储文件 → uploadPhoto → confirmReturn
    mockSdk.__state.cloudFiles.set('cloud://test/return.jpg', Buffer.from('cf-return-bytes'))
    const up = await okCall(borrowManage, {
      action: 'uploadPhoto', fileID: 'cloud://test/return.jpg', fileName: 'return.jpg'
    })
    await okCall(borrowManage, { action: 'confirmReturn', id: borrowId, photoUrl: up.fileToken })

    const list = await okCall(borrowManage, { action: 'getBorrowList', status: 'returned' })
    const rec = list.find(r => r._id === borrowId)
    ok(rec, '应找到已归还记录')
    ok(rec.collect_photo === `https://mock-feishu.local/tmp/${borrowManage._applyToken}`,
      `collect_photo 应复制申请附件并解析，实际 ${rec.collect_photo}`)
    ok(rec.return_photo === `https://mock-feishu.local/tmp/${up.fileToken}`,
      `return_photo 应解析为临时 URL，实际 ${rec.return_photo}`)
    // 库存恢复
    const item = await okCall(itemManage, { action: 'getItemDetail', id: itemId })
    ok(Number(item.available_quantity) === 150, `归还后可用应为 150，实际 ${item.available_quantity}`)
    ok(Number(item.borrowed_quantity) === 0, '归还后借出应为 0')
  })

  console.log('\n[5] 跨函数一致性')
  await test('borrowManage 的 token 缓存不依赖数据库外的全局', async () => {
    // 二次 getBorrowList 仍能解析（缓存命中路径）
    const list = await okCall(borrowManage, { action: 'getBorrowList', status: 'returned' })
    const rec = list.find(r => r._id === borrowId)
    ok(rec.return_photo.includes('mock-feishu.local/tmp/'), '二次读取应仍解析')
  })

  await test('userManage 与 borrowManage 使用独立 client 但共享飞书数据', async () => {
    const users = await okCall(userManage, { action: 'getUserList' })
    const borrows = await okCall(borrowManage, { action: 'getBorrowList' })
    ok(users.some(u => u.openid === ADMIN), 'users 应含管理员')
    ok(borrows.some(b => b._id === borrowId), 'borrows 应含测试记录')
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
  console.log(`wx-server-sdk: 已劫持为内存 mock`)

  try {
    await run()
  } catch (err) {
    console.error('\n云函数测试执行异常:', err)
    failed++
  } finally {
    await mockFeishu.stop()
    process.exit(failed > 0 ? 1 : 0)
  }
}

main()
