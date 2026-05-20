const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const util = require('../../../utils/util')

Page({
  data: {
    items: [],
    loading: true,
    returning: null,
    photoUrl: ''
  },

  onShow() {
    this.loadItems()
    this.setData({ photoUrl: '', returning: null })
  },

  async loadItems() {
    this.setData({ loading: true })
    try {
      const userInfo = auth.getUserInfo()
      if (!userInfo) return
      const records = await api.getBorrowList({
        borrowerId: userInfo.openid,
        status: 'collected'
      })
      this.setData({ items: records })
    } catch (err) {
      /* ignore */
    } finally {
      this.setData({ loading: false })
    }
  },

  selectItem(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ returning: id, photoUrl: '' })
  },

  cancelReturn() {
    this.setData({ returning: null, photoUrl: '' })
  },

  takePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        util.showLoading('上传中')
        try {
          const fileID = await api.uploadPhoto(tempPath)
          util.hideLoading()
          this.setData({ photoUrl: fileID })
        } catch (err) {
          util.hideLoading()
          util.showToast('上传失败')
        }
      }
    })
  },

  async confirmReturn() {
    if (!this.data.photoUrl) {
      util.showToast('请先拍照留档')
      return
    }
    const recordId = this.data.returning
    if (!recordId) return

    try {
      await api.confirmReturn(recordId, this.data.photoUrl)
      util.showToast('归还成功', 'success')
      this.setData({ returning: null, photoUrl: '' })
      this.loadItems()
    } catch (err) {
      util.showToast(err.message || '归还失败')
    }
  }
})
