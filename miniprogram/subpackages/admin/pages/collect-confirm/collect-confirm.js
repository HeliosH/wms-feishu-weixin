const api = require('../../../../utils/api')
const util = require('../../../../utils/util')

Page({
  data: {
    records: []
  },

  onShow() {
    this.loadRecords()
  },

  async loadRecords() {
    try {
      const list = await api.getBorrowList({ status: 'approved' })
      const records = list.map(r => ({
        ...r,
        // 领取照片相对路径 → 完整 URL 用于展示
        apply_photo: util.resolveFileUrl(r.apply_photo),
        approve_time_str: util.formatDate(r.approve_time)
      }))
      this.setData({ records })
    } catch (err) {
      util.showToast(err.message)
    }
  },

  previewPhoto(e) {
    wx.previewImage({ urls: [e.currentTarget.dataset.url] })
  },

  async onConfirm(e) {
    const id = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认领取',
      content: '确认该借用人已领取货物？',
      success: async (res) => {
        if (res.confirm) {
          util.showLoading('处理中')
          try {
            await api.confirmCollect(id)
            util.hideLoading()
            util.showToast('已确认领取', 'success')
            this.loadRecords()
          } catch (err) {
            util.hideLoading()
            util.showToast(err.message)
          }
        }
      }
    })
  }
})
