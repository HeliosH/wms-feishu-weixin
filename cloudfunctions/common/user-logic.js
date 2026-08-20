const { fromRecord } = require('./feishu-client')
const { buildPhotoField, resolveRecordPhotos, USER_AVATAR_FIELDS, isFileToken } = require('./photo')

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
    // 附件头像解析为临时 URL（回填 avatar_url）
    await resolveRecordPhotos(client, [user], USER_AVATAR_FIELDS)
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
  const users = (res.items || []).map(fromRecord)
  // 附件头像解析为临时 URL
  await resolveRecordPhotos(client, users, USER_AVATAR_FIELDS)
  return users
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

async function updateProfile(client, tableIds, openid, name, avatarUrl) {
  const user = await findUserByOpenid(client, tableIds.users, openid)
  if (!user) throw new Error('用户不存在')
  const fields = {}
  if (name !== undefined && name !== null) fields.name = name
  if (avatarUrl !== undefined && avatarUrl !== null) {
    // 头像为 file_token 时写附件字段，为 URL 时写文本字段
    buildPhotoField(fields, 'avatar_url', 'avatar_file', avatarUrl)
  }
  const res = await client.request('PUT', `/tables/${tableIds.users}/records/${user._id}`, { fields })
  const updated = fromRecord(res.record)
  await resolveRecordPhotos(client, [updated], USER_AVATAR_FIELDS)
  return updated
}

module.exports = {
  findUserByOpenid,
  login,
  getUserList,
  updateUserRole,
  toggleUserStatus,
  applyRole,
  approveRole,
  updateProfile
}
