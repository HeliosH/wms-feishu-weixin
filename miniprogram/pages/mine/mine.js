const auth = require('../../utils/auth')
const role = require('../../utils/role')

Page({
  data: {
    userInfo: null,
    roleLabel: '',
    isAdmin: false,
    isBorrower: false,
    needApplyRole: false
  },

  onShow() {
    const userInfo = auth.getUserInfo()
    if (!userInfo) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const r = userInfo.role
    const roles = Array.isArray(r) ? r : (typeof r === 'string' ? r.split(',').filter(Boolean) : [])
    const hasRole = roles.length > 0
    const isAdmin = role.isWarehouseAdmin(userInfo)
    const isActive = userInfo.status === 'active' || hasRole

    this.setData({
      userInfo,
      roleLabel: role.getRoleLabel(userInfo.role),
      isAdmin,
      isBorrower: roles.includes('borrower') && isActive,
      needApplyRole: (!hasRole && !isAdmin && userInfo.status === 'pending') ||
        (!roles.includes('borrower') && !isAdmin && userInfo.status === 'pending_review')
    })

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/user/profile/profile' })
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
