const auth = require('../../utils/auth')
const role = require('../../utils/role')
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    userInfo: null,
    roleLabel: '',
    isWarehouseAdmin: false,
    pendingCount: 0
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
    this.setData({
      userInfo,
      roleLabel: role.getRoleLabel(userInfo.role),
      isWarehouseAdmin: role.isWarehouseAdmin(userInfo)
    })
    if (role.isWarehouseAdmin(userInfo)) {
      this.loadPendingCount()
    }
  },

  async loadPendingCount() {
    try {
      const list = await api.getBorrowList({ status: 'pending_approval' })
      this.setData({ pendingCount: list.length || 0 })
    } catch (err) {
      // ignore
    }
  },

  goPage(e) {
    const url = e.currentTarget.dataset.url
    wx.navigateTo({ url })
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定退出登录？',
      success(res) {
        if (res.confirm) {
          auth.logout()
        }
      }
    })
  }
})
