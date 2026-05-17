const { fromRecord } = require('./feishu-client')

async function findUserByOpenid(client, usersTableId, openid) {
  const res = await client.request('GET', `/tables/${usersTableId}/records`, null, {
    filter: `CurrentValue.[openid]="${openid}"`,
    page_size: 1
  })
  if (res.items && res.items.length > 0) {
    return fromRecord(res.items[0])
  }
  return null
}

async function login(client, tableIds, openid) {
  const user = await findUserByOpenid(client, tableIds.users, openid)
  if (user) {
    if (user.status === 'inactive') {
      throw new Error('该账号已被禁用，请联系管理员')
    }
    return user
  }

  const createRes = await client.request('POST', `/tables/${tableIds.users}/records`, {
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

async function getUserList(client, tableIds) {
  const res = await client.request('GET', `/tables/${tableIds.users}/records`, null, { page_size: 500 })
  return (res.items || []).map(fromRecord)
}

async function updateUserRole(client, tableIds, targetOpenid, newRole) {
  const targetUser = await findUserByOpenid(client, tableIds.users, targetOpenid)
  if (!targetUser) throw new Error('用户不存在')

  const roles = Array.isArray(newRole) ? newRole : [newRole]
  const wasAdmin = Array.isArray(targetUser.role)
    ? targetUser.role.includes('admin')
    : targetUser.role === 'admin'

  if (wasAdmin && !roles.includes('admin')) {
    throw new Error('管理员角色不可移除')
  }

  await client.request('PUT', `/tables/${tableIds.users}/records/${targetUser._id}`, {
    fields: { role: roles }
  })
  return { success: true }
}

async function toggleUserStatus(client, tableIds, targetOpenid, newStatus) {
  const targetUser = await findUserByOpenid(client, tableIds.users, targetOpenid)
  if (!targetUser) throw new Error('用户不存在')

  const isAdmin = Array.isArray(targetUser.role)
    ? targetUser.role.includes('admin')
    : targetUser.role === 'admin'

  if (isAdmin) {
    throw new Error('管理员账号不可禁用')
  }

  await client.request('PUT', `/tables/${tableIds.users}/records/${targetUser._id}`, {
    fields: { status: newStatus }
  })
  return { success: true }
}

async function applyRole(client, tableIds, openid, name) {
  const user = await findUserByOpenid(client, tableIds.users, openid)
  if (!user) throw new Error('用户不存在')

  const roles = Array.isArray(user.role) ? user.role : []
  if (roles.includes('borrower')) throw new Error('你已经是借用人员，无需重复申请')
  if (user.status === 'pending_review') throw new Error('已有待审批的申请，请耐心等待')

  await client.request('PUT', `/tables/${tableIds.users}/records/${user._id}`, {
    fields: { name: name || user.name, status: 'pending_review' }
  })
  return { success: true }
}

async function approveRole(client, tableIds, targetOpenid, approved, role) {
  const targetUser = await findUserByOpenid(client, tableIds.users, targetOpenid)
  if (!targetUser) throw new Error('用户不存在')
  if (targetUser.status !== 'pending_review') throw new Error('该用户没有待审批的申请')

  const resultRole = Array.isArray(role) ? role : [role]
  await client.request('PUT', `/tables/${tableIds.users}/records/${targetUser._id}`, {
    fields: {
      status: approved ? 'active' : 'pending',
      role: approved ? resultRole : []
    }
  })
  return { success: true }
}

module.exports = {
  findUserByOpenid,
  login,
  getUserList,
  updateUserRole,
  toggleUserStatus,
  applyRole,
  approveRole
}
