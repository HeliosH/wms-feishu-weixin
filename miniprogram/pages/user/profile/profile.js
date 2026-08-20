const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const role = require('../../../utils/role')
const util = require('../../../utils/util')

Page({
  data: {
    userInfo: null,
    roleLabel: '',
    roles: [],
    editing: false,
    editName: '',
    saving: false
  },

  onShow() {
    const userInfo = auth.getUserInfo()
    if (!userInfo) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const roles = Array.isArray(userInfo.role) ? userInfo.role : []
    this.setData({
      userInfo,
      roleLabel: role.getRoleLabel(userInfo.role),
      roles,
      editName: userInfo.name || '',
      editing: false
    })
  },

  startEdit() {
    this.setData({ editing: true, editName: this.data.userInfo.name || '' })
  },

  cancelEdit() {
    this.setData({ editing: false, editName: this.data.userInfo.name || '' })
  },

  onNameInput(e) {
    this.setData({ editName: e.detail.value })
  },

  async saveName() {
    const name = this.data.editName.trim()
    if (!name) {
      util.showToast('请输入姓名')
      return
    }
    this.setData({ saving: true })
    try {
      const updated = await api.updateProfile(name, undefined)
      auth.setUserInfo({ ...this.data.userInfo, name: updated.name, avatar_url: updated.avatar_url })
      this.setData({
        userInfo: auth.getUserInfo(),
        editing: false,
        saving: false
      })
      util.showToast('已更新', 'success')
    } catch (err) {
      this.setData({ saving: false })
      util.showToast(err.message || '更新失败')
    }
  },

  onChangeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        util.showLoading('上传中')
        try {
          const { token } = await api.uploadPhoto(tempPath)
          const updated = await api.updateProfile(undefined, token)
          auth.setUserInfo({ ...this.data.userInfo, name: updated.name, avatar_url: updated.avatar_url })
          this.setData({ userInfo: auth.getUserInfo() })
          util.hideLoading()
          util.showToast('头像已更新', 'success')
        } catch (err) {
          util.hideLoading()
          util.showToast('上传失败')
        }
      }
    })
  },

  goApplyRole() {
    wx.navigateTo({ url: '/pages/borrow/apply-role/apply-role' })
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定退出登录？',
      success(res) {
        if (res.confirm) auth.logout()
      }
    })
  }
})
