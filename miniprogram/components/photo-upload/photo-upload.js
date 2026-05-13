const api = require('../../utils/api')

Component({
  properties: {
    photoUrl: { type: String, value: '' }
  },
  methods: {
    onTakePhoto() {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera'],
        success: async (res) => {
          const tempPath = res.tempFiles[0].tempFilePath
          wx.showLoading({ title: '上传中' })
          try {
            const fileID = await api.uploadPhoto(tempPath)
            wx.hideLoading()
            this.triggerEvent('upload', { fileID })
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: '上传失败', icon: 'none' })
          }
        }
      })
    }
  }
})
