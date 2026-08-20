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
      const list = await api.getBorrowList({ status: 'collected' })
      const records = list.map(r => ({
        ...r,
        // 领取照片相对路径 → 完整 URL 用于展示
        collect_photo: util.resolveFileUrl(r.collect_photo),
        collect_time_str: util.formatDate(r.collect_time),
        returnPhotoUrl: '',
        returnPhotoFileId: ''
      }))
      this.setData({ records })
    } catch (err) {
      util.showToast(err.message)
    }
  },

  onTakePhoto(e) {
    const index = e.currentTarget.dataset.index
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        util.showLoading('上传中')
        try {
          const fileID = await api.uploadPhoto(tempPath)
          // 展示用完整 URL，提交用原始相对路径
          this.setData({
            [`records[${index}].returnPhotoUrl`]: util.resolveFileUrl(fileID),
            [`records[${index}].returnPhotoFileId`]: fileID
          })
          util.hideLoading()
        } catch (err) {
          util.hideLoading()
          util.showToast('上传失败')
        }
      }
    })
  },

  previewPhoto(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({ urls: [url] })
  },

  async onConfirm(e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    const photoUrl = this.data.records[index].returnPhotoFileId || this.data.records[index].returnPhotoUrl

    if (!photoUrl) {
      util.showToast('请先拍照留档')
      return
    }

    wx.showModal({
      title: '确认归还',
      content: '确认货物已归还？库存将自动恢复。',
      success: async (res) => {
        if (res.confirm) {
          util.showLoading('处理中')
          try {
            await api.confirmReturn(id, photoUrl)
            util.hideLoading()
            util.showToast('已确认归还', 'success')
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
