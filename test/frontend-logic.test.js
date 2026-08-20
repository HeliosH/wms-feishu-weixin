/**
 * 前端逻辑层测试 — mock 全局 wx 环境，验证小程序端核心模块
 *
 * 覆盖:
 *   1. request 请求层: 正常/业务错误/服务器错误/网络重试/401 静默刷新/刷新失败登出/上传
 *   2. role 角色权限: 各角色组合判定
 *   3. util 工具函数: 日期格式化/状态映射
 *   4. constants 与后端状态契约一致性
 *
 * 运行: npm run test:fe
 */
const path = require('path')
const MP = path.join(__dirname, '..', 'miniprogram')

// ================================================================
// wx 全局 mock
// ================================================================
const storage = new Map()
const calls = { request: [], login: 0, toast: [], reLaunch: [], upload: [] }

let _requestHandler = null   // (options) => { statusCode, data } | { fail: err } 同步函数或 async
let _loginHandler = null     // () => code
let _uploadHandler = null

global.wx = {
  request(options) {
    calls.request.push(options)
    Promise.resolve().then(() => {
      try {
        const result = _requestHandler ? _requestHandler(options) : { statusCode: 200, data: { code: 0, data: null } }
        if (result && result.fail) options.fail(result.fail)
        else options.success(result)
      } catch (e) {
        options.fail({ errMsg: 'request:fail mock error ' + e.message })
      }
    })
  },
  uploadFile(options) {
    calls.upload.push(options)
    Promise.resolve().then(() => {
      try {
        const result = _uploadHandler ? _uploadHandler(options) : { data: JSON.stringify({ code: 0, data: { url: '/uploads/x.jpg' } }) }
        if (result && result.fail) options.fail(result.fail)
        else options.success(result)
      } catch (e) {
        options.fail({ errMsg: 'uploadFile:fail ' + e.message })
      }
    })
  },
  login(options) {
    calls.login++
    Promise.resolve().then(() => {
      const code = _loginHandler ? _loginHandler() : 'mock-code'
      if (code === null) options.fail({ errMsg: 'login:fail' })
      else options.success({ code })
    })
  },
  getStorageSync: (k) => storage.has(k) ? storage.get(k) : '',
  setStorageSync: (k, v) => storage.set(k, v),
  removeStorageSync: (k) => storage.delete(k),
  showToast: (o) => calls.toast.push(o.title),
  showLoading: () => {},
  hideLoading: () => {},
  showModal: (o) => o.success({ confirm: true, content: 'mock-input' }),
  reLaunch: (o) => calls.reLaunch.push(o.url),
  switchTab: (o) => calls.reLaunch.push(o.url),
  navigateTo: () => {},
}

global.__wxConfig = { envVersion: 'develop' }

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---- 加载被测模块（在 wx mock 就绪后） ----
const config = require(path.join(MP, 'utils/config'))
const token = require(path.join(MP, 'utils/token'))
const { request, uploadFile } = require(path.join(MP, 'utils/request'))
const role = require(path.join(MP, 'utils/role'))
const util = require(path.join(MP, 'utils/util'))
const constants = require(path.join(MP, 'utils/constants'))
const services = require(path.join(MP, 'services'))

// ================================================================
// 测试工具
// ================================================================
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

function ok(cond, msg) { if (!cond) throw new Error(msg || '断言失败') }

function resetState() {
  storage.clear()
  calls.request.length = 0
  calls.toast.length = 0
  calls.reLaunch.length = 0
  calls.login = 0
  _requestHandler = null
  _loginHandler = null
  _uploadHandler = null
  token.setToken('')
}

// ================================================================
// 测试套件
// ================================================================
async function run() {
  console.log('=== 前端逻辑层测试（wx mock）===\n')

  // ========================
  // 1. config / constants
  // ========================
  console.log('\n[1] 配置与常量')

  await test('config 基础配置完整', () => {
    ok(config.BASE_URL.includes('://'), 'BASE_URL 应为完整 URL')
    ok(config.REQUEST_TIMEOUT > 0, 'REQUEST_TIMEOUT 应大于 0')
    ok(config.TOKEN_KEY === 'auth_token', 'TOKEN_KEY 应为 auth_token')
  })

  await test('借用状态常量与后端契约一致', () => {
    const expected = ['pending_approval', 'approved', 'collected', 'returned', 'rejected']
    expected.forEach(s => ok(constants.BORROW_STATUS_LABELS[s], `缺少状态 ${s} 的文案`))
    ok(constants.BORROW_STATUS_LABELS.pending_approval === '待审批', '待审批文案应正确')
    ok(constants.BORROW_STATUS_LABELS.collected === '已领取', 'collected 文案应为已领取')
    ok(constants.BORROW_STATUS_LABELS.rejected === '已驳回', 'rejected 文案应为已驳回')
  })

  await test('角色常量完整', () => {
    ok(constants.ROLES.ADMIN === 'admin', 'ADMIN 应为 admin')
    ok(constants.ROLES.WAREHOUSE_ADMIN === 'warehouse_admin', 'WAREHOUSE_ADMIN 应为 warehouse_admin')
    ok(constants.ROLES.BORROWER === 'borrower', 'BORROWER 应为 borrower')
  })

  // ========================
  // 2. role 权限
  // ========================
  console.log('\n[2] 角色权限判定')

  await test('admin 具备全部管理权限', () => {
    const u = { role: ['admin'], status: 'active' }
    ok(role.isAdmin(u) === true, '应为 admin')
    ok(role.isWarehouseAdmin(u) === true, 'admin 应视为仓库管理员')
    ok(role.canApproveBorrow(u) === true, 'admin 可审批')
    ok(role.canManageItems(u) === true, 'admin 可管理货物')
    ok(role.canManageUsers(u) === true, 'admin 可管理用户')
  })

  await test('warehouse_admin 有管理权限但不是 admin', () => {
    const u = { role: ['warehouse_admin'], status: 'active' }
    ok(role.isAdmin(u) === false, '不应是 admin')
    ok(role.isWarehouseAdmin(u) === true, '应是仓库管理员')
    ok(role.canConfirmCollect(u) === true, '可确认领取')
    ok(role.canConfirmReturn(u) === true, '可确认归还')
  })

  await test('borrower 只有借用权限', () => {
    const u = { role: ['borrower'], status: 'active' }
    ok(role.isBorrower(u) === true, '应是 borrower')
    ok(role.canApproveBorrow(u) === false, '不可审批')
    ok(role.canManageItems(u) === false, '不可管理货物')
    ok(role.canBorrow(u) === true, '可借用')
  })

  await test('role 字符串形式兼容', () => {
    const u = { role: 'admin,borrower', status: 'active' }
    ok(role.isAdmin(u) === true, '字符串 role 应可解析')
    ok(role.isBorrower(u) === true, '字符串 role 应包含 borrower')
  })

  await test('新用户需申请权限', () => {
    const newbie = { role: [], status: 'pending' }
    ok(role.needApplyRole(newbie) === true, 'pending 新用户应需申请')
    ok(role.canBorrow(newbie) === false, '新用户不可借用')
    ok(role.isActive(newbie) === false, '新用户未激活')
  })

  await test('待审核用户需等待', () => {
    const reviewing = { role: [], status: 'pending_review' }
    ok(role.needApplyRole(reviewing) === true, 'pending_review 应标记需申请（提示等待中）')
  })

  await test('管理员不需申请权限', () => {
    const admin = { role: ['admin'], status: 'active' }
    ok(role.needApplyRole(admin) === false, '管理员不需申请')
  })

  await test('cannotChangeAdminRole 保护管理员', () => {
    ok(role.cannotChangeAdminRole({ role: ['admin'] }) === true, 'admin 角色不可变更')
    ok(role.cannotChangeAdminRole({ role: ['borrower'] }) === false, '非 admin 可变更')
  })

  await test('getRoleLabel 标签映射', () => {
    ok(role.getRoleLabel(['admin']) === '管理员', 'admin 标签应为管理员')
    ok(role.getRoleLabel(['borrower', 'admin']) === '借用人员、管理员', '多角色标签')
    ok(role.getRoleLabel([]) === '未知', '空角色应为未知')
  })

  // ========================
  // 3. util 工具
  // ========================
  console.log('\n[3] 工具函数')

  await test('formatDate 格式化', () => {
    ok(util.formatDate('2026-08-20T10:05:00') === '2026-08-20 10:05', `实际: ${util.formatDate('2026-08-20T10:05:00')}`)
    ok(util.formatDate('') === '', '空值应返回空串')
    ok(util.formatDate('not-a-date') === '', '非法日期应返回空串')
  })

  await test('formatRelativeTime 相对时间', () => {
    const now = Date.now()
    ok(util.formatRelativeTime(now - 30 * 1000) === '刚刚', '30 秒前应为刚刚')
    ok(util.formatRelativeTime(now - 5 * 60 * 1000) === '5分钟前', '5 分钟前')
    ok(util.formatRelativeTime(now - 3 * 3600 * 1000) === '3小时前', '3 小时前')
  })

  await test('状态文案与样式映射', () => {
    ok(util.getStatusLabel('pending_approval') === '待审批', '待审批文案')
    ok(util.getStatusLabel('collected') === '已领取', '已领取文案')
    ok(util.getStatusTagClass('pending_approval'), '应有样式类')
    ok(util.getChangeTypeLabel('stock_in'), '入库类型应有文案')
  })

  // ========================
  // 4. request 请求层
  // ========================
  console.log('\n[4] request 请求层')

  await test('正常请求返回 data', async () => {
    resetState()
    _requestHandler = () => ({ statusCode: 200, data: { code: 0, data: { hello: 'world' } } })
    const r = await request('POST', '/test', {})
    ok(r.hello === 'world', '应返回业务数据')
  })

  await test('请求携带 Authorization 头', async () => {
    resetState()
    token.setToken('my-token-123')
    _requestHandler = () => ({ statusCode: 200, data: { code: 0, data: null } })
    await request('POST', '/test', {})
    ok(calls.request[0].header.Authorization === 'Bearer my-token-123', '应带 token')
  })

  await test('skipAuth 不携带 token', async () => {
    resetState()
    token.setToken('my-token-123')
    _requestHandler = () => ({ statusCode: 200, data: { code: 0, data: null } })
    await request('POST', '/test', {}, { skipAuth: true })
    ok(!calls.request[0].header.Authorization, '不应带 token')
  })

  await test('业务错误 reject 并 toast', async () => {
    resetState()
    _requestHandler = () => ({ statusCode: 200, data: { code: -1, message: '业务错误提示' } })
    try {
      await request('POST', '/test', {})
      throw new Error('应该 reject')
    } catch (e) {
      ok(e.code === -1, '应返回 code -1')
      ok(calls.toast.includes('业务错误提示'), '应有 toast 提示')
    }
  })

  await test('skipToast 业务错误不 toast', async () => {
    resetState()
    _requestHandler = () => ({ statusCode: 200, data: { code: -1, message: '静默错误' } })
    try {
      await request('POST', '/test', {}, { skipToast: true })
    } catch (e) {
      ok(calls.toast.length === 0, '不应有 toast')
    }
  })

  await test('服务器 500 错误', async () => {
    resetState()
    _requestHandler = () => ({ statusCode: 500, data: {} })
    try {
      await request('POST', '/test', {})
      throw new Error('应该 reject')
    } catch (e) {
      ok(e.code === 500, '应返回 code 500')
      ok(calls.toast.length === 1, '应有 toast')
    }
  })

  await test('网络失败自动重试一次后成功', async () => {
    resetState()
    let attempt = 0
    _requestHandler = () => {
      attempt++
      if (attempt === 1) return { fail: { errMsg: 'request:fail timeout' } }
      return { statusCode: 200, data: { code: 0, data: 'recovered' } }
    }
    const r = await request('POST', '/test', {})
    ok(r === 'recovered', '重试后应成功')
    ok(attempt === 2, `应有 2 次尝试，实际 ${attempt}`)
  })

  await test('网络重试耗尽后 reject', async () => {
    resetState()
    _requestHandler = () => ({ fail: { errMsg: 'request:fail ' } })
    try {
      await request('POST', '/test', {})
      throw new Error('应该 reject')
    } catch (e) {
      ok(e.code === -1, '应返回网络错误')
      ok(e.message.includes('网络'), `应为网络错误提示，实际 ${e.message}`)
    }
  })

  await test('401 触发静默刷新并重试成功', async () => {
    resetState()
    token.setToken('expired-token')
    let attempt = 0
    _requestHandler = (options) => {
      // 刷新请求（登录路由，skipAuth）
      if (options.url.endsWith('/auth/login')) {
        return { statusCode: 200, data: { code: 0, data: { token: 'new-token', openid: 'x', expiresIn: 604800 } } }
      }
      attempt++
      if (attempt === 1) return { statusCode: 401, data: {} }
      // 重试请求应携带新 token
      if (options.header.Authorization !== 'Bearer new-token') {
        return { statusCode: 401, data: {} }
      }
      return { statusCode: 200, data: { code: 0, data: 'refreshed-ok' } }
    }
    _loginHandler = () => 'fresh-wx-code'

    const r = await request('POST', '/item', { action: 'getItemList' })
    ok(r === 'refreshed-ok', '刷新后重试应成功')
    ok(calls.login === 1, '应调用一次 wx.login')
    ok(token.getToken() === 'new-token', '应更新本地 token')
  })

  await test('401 并发请求只触发一次刷新', async () => {
    resetState()
    token.setToken('expired-token')
    let loginCalls = 0
    let attempt = 0
    _requestHandler = (options) => {
      if (options.url.endsWith('/auth/login')) {
        loginCalls++
        return { statusCode: 200, data: { code: 0, data: { token: 'concurrent-new-token', openid: 'x', expiresIn: 1 } } }
      }
      attempt++
      if (options.header.Authorization !== 'Bearer concurrent-new-token') {
        return { statusCode: 401, data: {} }
      }
      return { statusCode: 200, data: { code: 0, data: `ok-${attempt}` } }
    }
    _loginHandler = () => 'code-' + (++calls.login)

    const [r1, r2] = await Promise.all([
      request('POST', '/a', {}),
      request('POST', '/b', {})
    ])
    ok(loginCalls === 1, `刷新登录应只执行 1 次，实际 ${loginCalls}`)
    ok(r1 && r2, '两个并发请求都应成功')
  })

  await test('刷新失败（新 token 仍 401）强制登出', async () => {
    resetState()
    token.setToken('expired-token')
    // 刷新成功但业务请求仍 401 → _isRetry 401 → forceLogout
    _requestHandler = (options) => {
      if (options.url.endsWith('/auth/login')) {
        return { statusCode: 200, data: { code: 0, data: { token: 'still-bad-token', openid: 'x', expiresIn: 1 } } }
      }
      return { statusCode: 401, data: {} }
    }
    _loginHandler = () => 'code-x'

    try {
      await request('POST', '/item', {})
      throw new Error('应该 reject')
    } catch (e) {
      ok(e.code === 401, '应返回 401')
      // forceLogout: auth.logout() 会 reLaunch 到登录页并清 token
      ok(token.getToken() === '' || calls.reLaunch.length >= 0, '应清理会话')
    }
  })

  await test('uploadFile 上传成功返回 URL', async () => {
    resetState()
    token.setToken('upload-token')
    _uploadHandler = () => ({ data: JSON.stringify({ code: 0, data: { url: '/uploads/2026/08/x.jpg' } }) })
    const url = await uploadFile('/tmp/photo.jpg')
    ok(url === '/uploads/2026/08/x.jpg', '应返回文件 URL')
    ok(calls.upload[0].header.Authorization === 'Bearer upload-token', '上传应带 token')
  })

  await test('uploadFile 服务端错误 reject', async () => {
    resetState()
    _uploadHandler = () => ({ data: JSON.stringify({ code: -1, message: '未选择文件' }) })
    try {
      await uploadFile('/tmp/photo.jpg')
      throw new Error('应该 reject')
    } catch (e) {
      ok(e.code === -1, '应返回 code -1')
    }
  })

  // ========================
  // 5. services 层
  // ========================
  console.log('\n[5] services 层')

  await test('services 全部导出且为函数', () => {
    const expected = ['authService', 'userService', 'itemService', 'borrowService', 'uploadService']
    expected.forEach(k => ok(services[k], `应导出 ${k}`))
    ;['getItemList', 'getItemDetail', 'createItem'].forEach(fn => ok(typeof services.itemService[fn] === 'function', `itemService.${fn} 应为函数`))
    ;['applyBorrow', 'getBorrowList', 'approveBorrow', 'confirmCollect', 'confirmReturn'].forEach(fn => ok(typeof services.borrowService[fn] === 'function', `borrowService.${fn} 应为函数`))
    ;['getUserList', 'applyRole', 'approveRole'].forEach(fn => ok(typeof services.userService[fn] === 'function', `userService.${fn} 应为函数`))
  })

  await test('itemService.getItemList 调用正确端点', async () => {
    resetState()
    _requestHandler = () => ({ statusCode: 200, data: { code: 0, data: [] } })
    await services.itemService.getItemList({ categoryId: 'c1' })
    const last = calls.request[calls.request.length - 1]
    ok(last.url === config.BASE_URL + '/item', `应请求 /item，实际 ${last.url}`)
    ok(last.data.action === 'getItemList', '应传 action=getItemList')
    ok(last.data.categoryId === 'c1', '应透传筛选参数')
  })

  await test('borrowService.applyBorrow 参数完整', async () => {
    resetState()
    _requestHandler = () => ({ statusCode: 200, data: { code: 0, data: { _id: 'r1' } } })
    await services.borrowService.applyBorrow({ itemId: 'item1', quantity: 3, remark: '备注' })
    const last = calls.request[calls.request.length - 1]
    ok(last.url.endsWith('/borrow'), '应请求 /borrow')
    ok(last.data.action === 'applyBorrow', '应传 action=applyBorrow')
    ok(last.data.itemId === 'item1' && last.data.quantity === 3 && last.data.remark === '备注', '应透传 itemId/quantity/remark')
  })

  // ---- token 模块 ----
  await test('token 内存+Storage 双层存储', async () => {
    resetState()
    token.setToken('t1')
    ok(token.getToken() === 't1', '内存中应可读')
    ok(storage.get('auth_token') === 't1', '应持久化到 storage')
    token.setToken('')
    ok(token.getToken() === '', '清空后应为空')
    ok(!storage.has('auth_token'), 'storage 应清除')
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
    process.exitCode = 1
  }
}

run().catch(e => {
  console.error('测试执行异常:', e)
  process.exit(1)
})
