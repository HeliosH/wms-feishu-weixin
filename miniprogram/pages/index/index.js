const auth = require('../../utils/auth')
const role = require('../../utils/role')
const api = require('../../utils/api')

Page({
  data: {
    userInfo: null,
    roleLabel: '',
    isWarehouseAdmin: false,
    isBorrower: false,
    needApplyRole: false,
    pendingBorrowCount: 0,
    pendingRoleCount: 0
  },

  onLoad() {
    if (!auth.checkLogin()) return
  },

  onShow() {
    const userInfo = auth.getUserInfo()
    console.log('[INDEX onShow] raw userInfo:', JSON.stringify(userInfo))
    if (!userInfo) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    // role 可能是数组或逗号分隔的字符串
    const r = userInfo.role
    console.log('[INDEX onShow] userInfo.role raw:', typeof r, r)
    const roles = Array.isArray(r) ? r : (typeof r === 'string' ? r.split(',').filter(Boolean) : [])
    console.log('[INDEX onShow] roles parsed:', JSON.stringify(roles))
    const hasRole = roles.length > 0
    // 有角色的用户视为已激活（避免飞书里手动加了角色但忘了改 status）
    const isActive = userInfo.status === 'active' || hasRole
    const isAdmin = role.isWarehouseAdmin(userInfo)
    console.log('[INDEX onShow] status:', userInfo.status, '| hasRole:', hasRole, '| isActive:', isActive, '| isAdmin:', isAdmin)
    const isBorrowerVal = (roles.includes('borrower') || isAdmin) && isActive
    const needApplyVal = (!hasRole && userInfo.status === 'pending' && !isAdmin) || (!roles.includes('borrower') && !isAdmin && userInfo.status === 'pending_review')
    console.log('[INDEX onShow] computed -> isBorrower:', isBorrowerVal, '| needApplyRole:', needApplyVal)

    this.setData({
      userInfo,
      roleLabel: role.getRoleLabel(userInfo.role),
      isWarehouseAdmin: isAdmin,
      isBorrower: isBorrowerVal,
      needApplyRole: needApplyVal
    })

    // 如果申请已通过但本地缓存未刷新，重新 login 刷新
    if (userInfo.status === 'pending_review') {
      this.refreshUserStatus()
    }

    if (role.isWarehouseAdmin(userInfo)) {
      this.loadAdminCounts()
    }
  },

  async refreshUserStatus() {
    try {
      const userInfo = await auth.doLogin()
      const r2 = userInfo.role
      const roles2 = Array.isArray(r2) ? r2 : (typeof r2 === 'string' ? r2.split(',').filter(Boolean) : [])
      const hasRole2 = roles2.length > 0
      const isActive2 = userInfo.status === 'active' || hasRole2
      const isAdmin2 = role.isWarehouseAdmin(userInfo)
      this.setData({
        userInfo,
        roleLabel: role.getRoleLabel(userInfo.role),
        isWarehouseAdmin: isAdmin2,
        isBorrower: (roles2.includes('borrower') || isAdmin2) && isActive2,
        needApplyRole: userInfo.status !== 'active' && !roles2.includes('borrower') && !isAdmin2
      })
    } catch (err) { /* ignore */ }
  },

  async loadAdminCounts() {
    try {
      const borrowList = await api.getBorrowList({ status: 'pending_approval' })
      this.setData({ pendingBorrowCount: borrowList.length || 0 })
    } catch (err) { /* ignore */ }
    try {
      const allUsers = await api.getUserList()
      const pendingUsers = allUsers.filter(u => u.status === 'pending_review')
      this.setData({ pendingRoleCount: pendingUsers.length || 0 })
    } catch (err) { /* ignore */ }
  },

  goPage(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定退出登录？',
      success(res) {
        if (res.confirm) auth.logout()
      }
    })
  }
})
