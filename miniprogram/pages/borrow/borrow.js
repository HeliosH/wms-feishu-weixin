const api = require('../../utils/api')
const auth = require('../../utils/auth')
const role = require('../../utils/role')
const util = require('../../utils/util')

Page({
  data: {
    userInfo: null,
    isBorrower: false,
    needApplyRole: false,
    myItems: [],
    myItemsLoading: true
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }

    const userInfo = auth.getUserInfo()
    if (!userInfo) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const r = userInfo.role
    const roles = Array.isArray(r) ? r : (typeof r === 'string' ? r.split(',').filter(Boolean) : [])
    const hasRole = roles.length > 0
    const isActive = userInfo.status === 'active' || hasRole
    const isAdmin = role.isWarehouseAdmin(userInfo)
    const isBorrower = (roles.includes('borrower') || isAdmin) && isActive
    const needApply = (!hasRole && userInfo.status === 'pending' && !isAdmin) ||
      (!roles.includes('borrower') && !isAdmin && userInfo.status === 'pending_review')

    this.setData({ userInfo, isBorrower, needApplyRole: needApply })

    if (userInfo.status === 'pending_review') {
      this.refreshUserStatus()
      return
    }

    if (isBorrower) {
      this.loadMyItems()
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
        isBorrower: (roles2.includes('borrower') || isAdmin2) && isActive2,
        needApplyRole: userInfo.status !== 'active' && !roles2.includes('borrower') && !isAdmin2
      })
      if ((roles2.includes('borrower') || isAdmin2) && isActive2) {
        this.loadMyItems()
      }
    } catch (err) { /* ignore */ }
  },

  async loadMyItems() {
    this.setData({ myItemsLoading: true })
    try {
      const records = await api.getBorrowList({
        borrowerId: this.data.userInfo.openid,
        status: 'collected'
      })
      this.setData({
        myItems: records.map(r => ({
          ...r,
          collectTimeStr: util.formatDate(r.collect_time)
        }))
      })
    } catch (err) { /* ignore */ } finally {
      this.setData({ myItemsLoading: false })
    }
  },

  goBorrow() {
    wx.navigateTo({ url: '/pages/borrow/apply/apply' })
  },

  goReturn() {
    wx.navigateTo({ url: '/pages/borrow/return/return' })
  },

  goInTransit() {
    wx.navigateTo({ url: '/pages/borrow/in-transit/in-transit' })
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/borrow/history/history' })
  },

  goApplyRole() {
    wx.navigateTo({ url: '/pages/borrow/apply-role/apply-role' })
  }
})
