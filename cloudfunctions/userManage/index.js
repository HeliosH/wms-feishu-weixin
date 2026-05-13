const cloud = require('wx-server-sdk')
const axios = require('axios')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

let localConfig = { feishu: {} }
try { localConfig = require('./config.json') } catch (e) {
  try { localConfig = require('../feishuConfig.json') } catch (e2) {}
}
const KEY_MAP = { FEISHU_APP_ID: 'appId', FEISHU_APP_SECRET: 'appSecret', FEISHU_BITABLE_APP_TOKEN: 'bitableAppToken', FEISHU_TABLE_USERS: 'tableUsers' }
function getConfig(key) { return process.env[key] || localConfig.feishu[KEY_MAP[key]] || '' }

const FEISHU_BASE = 'https://open.feishu.cn/open-apis/bitable/v1/apps'
const USERS_TABLE_ID = getConfig('FEISHU_TABLE_USERS')

function getAppToken() {
  const token = getConfig('FEISHU_BITABLE_APP_TOKEN')
  if (!token) throw new Error('请配置 Bitable App Token')
  return token
}

async function getTenantAccessToken() {
  const db = cloud.database()
  const cacheRes = await db.collection('system_cache').where({ key: 'feishu_token_cache' }).get()
  if (cacheRes.data && cacheRes.data.length > 0) {
    if (cacheRes.data[0].expire_at > Date.now() / 1000) return cacheRes.data[0].token
  }
  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: getConfig('FEISHU_APP_ID'),
    app_secret: getConfig('FEISHU_APP_SECRET')
  }, { headers: { 'Content-Type': 'application/json' } })
  if (res.data.code !== 0) throw new Error(`获取飞书token失败: ${res.data.msg}`)
  const token = res.data.tenant_access_token
  const expireAt = Math.floor(Date.now() / 1000) + (res.data.expire || 7200) - 300
  if (cacheRes.data && cacheRes.data.length > 0) {
    await db.collection('system_cache').doc(cacheRes.data[0]._id).update({ token, expire_at: expireAt })
  } else {
    await db.collection('system_cache').add({ data: { key: 'feishu_token_cache', token, expire_at: expireAt } })
  }
  return token
}

async function bitableRequest(method, path, data = null, params = null) {
  const token = await getTenantAccessToken()
  const config = {
    method, url: `${FEISHU_BASE}/${getAppToken()}${path}`,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  }
  if (data) config.data = data
  if (params) config.params = params
  const res = await axios(config)
  if (res.data.code !== 0) throw new Error(`飞书API错误: ${res.data.msg}`)
  return res.data.data
}

function fromRecord(record) {
  return { _id: record.record_id, ...record.fields }
}

// 登录 — 通过openid查询或创建用户
async function login(openid) {
  // 查找用户
  const listRes = await bitableRequest('GET', `/tables/${USERS_TABLE_ID}/records`, null, {
    filter: `CurrentValue.[openid] = "${openid}"`,
    page_size: 1
  })

  if (listRes.items && listRes.items.length > 0) {
    const user = fromRecord(listRes.items[0])
    if (user.status === 'inactive') {
      throw new Error('该账号已被禁用，请联系管理员')
    }
    return user
  }

  // 新用户注册 — 无角色，待申请
  const createRes = await bitableRequest('POST', `/tables/${USERS_TABLE_ID}/records`, {
    fields: {
      openid,
      name: '',
      avatar_url: '',
      role: [],
      status: 'pending',
      created_at: Date.now()
    }
  })
  return fromRecord(createRes.record)
}

// 申请借用人员权限
async function applyRole(openid, name) {
  const listRes = await bitableRequest('GET', `/tables/${USERS_TABLE_ID}/records`, null, {
    filter: `CurrentValue.[openid] = "${openid}"`,
    page_size: 1
  })
  if (!listRes.items || listRes.items.length === 0) throw new Error('用户不存在')

  const user = fromRecord(listRes.items[0])
  const roles = Array.isArray(user.role) ? user.role : []
  if (roles.includes('borrower')) throw new Error('你已经是借用人员，无需重复申请')
  if (user.status === 'pending_review') throw new Error('已有待审批的申请，请耐心等待')

  await bitableRequest('PUT', `/tables/${USERS_TABLE_ID}/records/${user._id}`, {
    fields: { name: name || user.name, status: 'pending_review' }
  })
  return { success: true }
}

// 审批权限申请
async function approveRole(targetOpenid, approved, role, operatorOpenid) {
  const targetUser = await findUserByOpenid(targetOpenid)
  if (!targetUser) throw new Error('用户不存在')
  if (targetUser.status !== 'pending_review') throw new Error('该用户没有待审批的申请')

  const resultRole = Array.isArray(role) ? role : [role]
  await bitableRequest('PUT', `/tables/${USERS_TABLE_ID}/records/${targetUser._id}`, {
    fields: {
      status: approved ? 'active' : 'pending',
      role: approved ? resultRole : []
    }
  })
  return { success: true }
}

// 获取用户列表
async function getUserList() {
  const listRes = await bitableRequest('GET', `/tables/${USERS_TABLE_ID}/records`, null, {
    page_size: 500
  })
  return (listRes.items || []).map(fromRecord)
}

// 通过openid查找用户
async function findUserByOpenid(openid) {
  const listRes = await bitableRequest('GET', `/tables/${USERS_TABLE_ID}/records`, null, {
    filter: `CurrentValue.[openid] = "${openid}"`,
    page_size: 1
  })
  if (listRes.items && listRes.items.length > 0) {
    return fromRecord(listRes.items[0])
  }
  return null
}

// 更新用户角色 — newRole 为数组，管理员的 admin 角色不可移除
async function updateUserRole(targetOpenid, newRole, currentUserId) {
  const targetUser = await findUserByOpenid(targetOpenid)
  if (!targetUser) throw new Error('用户不存在')

  const roles = Array.isArray(newRole) ? newRole : [newRole]
  const wasAdmin = Array.isArray(targetUser.role)
    ? targetUser.role.includes('admin')
    : targetUser.role === 'admin'

  if (wasAdmin && !roles.includes('admin')) {
    throw new Error('管理员角色不可移除')
  }

  await bitableRequest('PUT', `/tables/${USERS_TABLE_ID}/records/${targetUser._id}`, {
    fields: { role: roles }
  })
  return { success: true }
}

// 启用/禁用用户
async function toggleUserStatus(targetOpenid, newStatus) {
  const targetUser = await findUserByOpenid(targetOpenid)
  if (!targetUser) throw new Error('用户不存在')

  const isAdmin = Array.isArray(targetUser.role)
    ? targetUser.role.includes('admin')
    : targetUser.role === 'admin'

  if (isAdmin) {
    throw new Error('管理员账号不可禁用')
  }

  await bitableRequest('PUT', `/tables/${USERS_TABLE_ID}/records/${targetUser._id}`, {
    fields: { status: newStatus }
  })
  return { success: true }
}

exports.main = async (event, context) => {
  const { action } = event
  const callerOpenid = cloud.getWXContext().OPENID

  try {
    let result
    switch (action) {
      case 'login':
        result = await login(callerOpenid)
        break
      case 'getUserList':
        result = await getUserList()
        break
      case 'updateUserRole':
        result = await updateUserRole(event.openid, event.role, callerOpenid)
        break
      case 'toggleUserStatus':
        result = await toggleUserStatus(event.openid, event.status)
        break
      case 'applyRole':
        result = await applyRole(callerOpenid, event.name)
        break
      case 'approveRole':
        result = await approveRole(event.openid, event.approved, event.role, callerOpenid)
        break
      default:
        throw new Error(`未知操作: ${action}`)
    }
    return { code: 0, data: result }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}
