const auth = require('../../utils/auth')
const role = require('../../utils/role')

Page({
  data: {
    userInfo: null,
    roleLabel: '',
    isAdmin: false,
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

    this.setData({
      userInfo,
      roleLabel: role.getRoleLabel(userInfo.role),
      isAdmin,
      needApplyRole: !hasRole && !isAdmin && userInfo.status === 'pending'
    })

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
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
