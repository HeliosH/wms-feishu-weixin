const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const util = require('../../../utils/util')

Page({
  data: {
    name: '',
    status: '',
    hasBorrower: false,
    submitting: false
  },

  onLoad() {
    const user = auth.getUserInfo()
    if (!user) return
    const roles = Array.isArray(user.role) ? user.role : []
    this.setData({
      name: user.name || '',
      status: user.status || '',
      hasBorrower: roles.includes('borrower')
    })
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  async onSubmit() {
    if (!this.data.name.trim()) {
      util.showToast('请输入姓名')
      return
    }
    this.setData({ submitting: true })
    try {
      await api.applyRole(this.data.name.trim())
      util.showToast('申请已提交', 'success')
      const user = auth.getUserInfo()
      if (user) { user.status = 'pending_review'; auth.setUserInfo(user) }
      this.setData({ status: 'pending_review' })
    } catch (err) {
      util.showToast(err.message)
    } finally {
      this.setData({ submitting: false })
    }
  }
})
