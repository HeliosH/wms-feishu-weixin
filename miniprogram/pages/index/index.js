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
    if (!userInfo) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const roles = Array.isArray(userInfo.role) ? userInfo.role : []
    const hasRole = roles.length > 0
    const isActive = userInfo.status === 'active'

    this.setData({
      userInfo,
      roleLabel: role.getRoleLabel(userInfo.role),
      isWarehouseAdmin: role.isWarehouseAdmin(userInfo),
      isBorrower: roles.includes('borrower') && isActive,
      needApplyRole: !hasRole || userInfo.status === 'pending' || (!roles.includes('borrower') && userInfo.status !== 'pending_review')
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
      const roles = Array.isArray(userInfo.role) ? userInfo.role : []
      const isActive = userInfo.status === 'active'
      this.setData({
        userInfo,
        roleLabel: role.getRoleLabel(userInfo.role),
        isWarehouseAdmin: role.isWarehouseAdmin(userInfo),
        isBorrower: roles.includes('borrower') && isActive,
        needApplyRole: userInfo.status !== 'active' && !roles.includes('borrower')
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
