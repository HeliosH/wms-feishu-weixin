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
    this._photoFileId = null
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
    this._photoFileId = null
    this.setData({ returning: id, photoUrl: '' })
  },

  cancelReturn() {
    this._photoFileId = null
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
          // 提交时用原始相对路径，预览时解析为完整 URL
          this._photoFileId = fileID
          this.setData({ photoUrl: util.resolveFileUrl(fileID) })
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
      await api.confirmReturn(recordId, this._photoFileId)
      util.showToast('归还成功', 'success')
      this._photoFileId = null
      this.setData({ returning: null, photoUrl: '' })
      this.loadItems()
    } catch (err) {
      util.showToast(err.message || '归还失败')
    }
  }
})
