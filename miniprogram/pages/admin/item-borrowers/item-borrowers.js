const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data: {
    itemId: '',
    itemName: '',
    borrowers: []
  },

  onLoad(options) {
    this.setData({ itemId: options.itemId })
    this.loadData()
  },

  async loadData() {
    try {
      const item = await api.getItemDetail(this.data.itemId)
      this.setData({ itemName: item.name })
      const list = await api.getItemBorrowers(this.data.itemId)
      const borrowers = list.map(b => ({
        ...b,
        collect_time_str: util.formatDate(b.collect_time)
      }))
      this.setData({ borrowers })
    } catch (err) {
      util.showToast(err.message)
    }
  },

  previewPhoto(e) {
    wx.previewImage({ urls: [e.currentTarget.dataset.url] })
  }
})
