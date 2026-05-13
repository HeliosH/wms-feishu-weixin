const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const role = require('../../../utils/role')

Page({
  data: {
    item: {},
    borrowers: [],
    isWarehouseAdmin: false,
    itemId: ''
  },

  onLoad(options) {
    this.setData({
      itemId: options.id,
      isWarehouseAdmin: role.isWarehouseAdmin(auth.getUserInfo())
    })
    this.loadDetail()
  },

  onPullDownRefresh() {
    this.loadDetail().then(() => wx.stopPullDownRefresh())
  },

  async loadDetail() {
    try {
      const item = await api.getItemDetail(this.data.itemId)
      this.setData({ item })

      if (this.data.isWarehouseAdmin) {
        const borrowers = await api.getItemBorrowers(this.data.itemId)
        this.setData({ borrowers })
      }
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  goApplyBorrow() {
    wx.navigateTo({ url: `/pages/borrow/apply/apply?itemId=${this.data.itemId}` })
  },

  goAdjust() {
    wx.navigateTo({ url: `/pages/admin/inventory/inventory?id=${this.data.itemId}` })
  },

  goLog() {
    wx.navigateTo({ url: `/pages/admin/inventory-log/inventory-log?itemId=${this.data.itemId}` })
  },

  goBorrowers() {
    wx.navigateTo({ url: `/pages/admin/item-borrowers/item-borrowers?itemId=${this.data.itemId}` })
  }
})
