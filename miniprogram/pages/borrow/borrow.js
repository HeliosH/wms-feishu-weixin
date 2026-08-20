const auth = require('../../utils/auth')
const role = require('../../utils/role')
const util = require('../../utils/util')
const { borrowService } = require('../../services/index')

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

    this.setData({
      userInfo,
      isBorrower: role.canBorrow(userInfo),
      needApplyRole: role.needApplyRole(userInfo)
    })

    // 如果申请已通过但本地缓存未刷新，重新 login 刷新
    if (userInfo.status === 'pending_review') {
      this.refreshUserStatus()
      return
    }

    if (role.canBorrow(userInfo)) {
      this.loadMyItems()
    }
  },

  async refreshUserStatus() {
    try {
      const userInfo = await auth.doLogin()
      const canBorrow = role.canBorrow(userInfo)
      this.setData({
        userInfo,
        isBorrower: canBorrow,
        needApplyRole: role.needApplyRole(userInfo)
      })
      if (canBorrow) {
        this.loadMyItems()
      }
    } catch (err) { /* 静默失败，下次 onShow 会重试 */ }
  },

  async loadMyItems() {
    this.setData({ myItemsLoading: true })
    try {
      const records = await borrowService.getBorrowList({
        borrowerId: this.data.userInfo.openid,
        status: 'collected'
      })
      this.setData({
        myItems: records.map(r => ({
          ...r,
          collectTimeStr: util.formatDate(r.collect_time)
        }))
      })
    } catch (err) { /* 错误已由 request 层统一 toast */ } finally {
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
