const { uploadService } = require('../../services/index')

Component({
  properties: {
    photoUrl: { type: String, value: '' },
    label: { type: String, value: '拍照上传' }
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
            const { token, url } = await uploadService.uploadPhoto(tempPath)
            wx.hideLoading()
            // token 提交给后端，url 用于预览
            this.triggerEvent('upload', { fileID: token, url })
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: err.message || '上传失败', icon: 'none' })
          }
        }
      })
    },

    onPreviewPhoto() {
      if (this.data.photoUrl) {
        wx.previewImage({ urls: [this.data.photoUrl] })
      }
    }
  }
})
