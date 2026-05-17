const auth = require('../../utils/auth')
const role = require('../../utils/role')
const api = require('../../utils/api')

Page({
  data: {
    pendingBorrowCount: 0,
    pendingRoleCount: 0
  },

  onShow() {
    const userInfo = auth.getUserInfo()
    if (role.isWarehouseAdmin(userInfo)) {
      this.loadCounts()
    }
    // 更新 tabBar 选中
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  async loadCounts() {
    try {
      const list = await api.getBorrowList({ status: 'pending_approval' })
      this.setData({ pendingBorrowCount: list.length || 0 })
    } catch (err) { /* ignore */ }
    try {
      const all = await api.getUserList()
      const pending = all.filter(u => u.status === 'pending_review')
      this.setData({ pendingRoleCount: pending.length || 0 })
    } catch (err) { /* ignore */ }
  },

  goPage(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  }
})
