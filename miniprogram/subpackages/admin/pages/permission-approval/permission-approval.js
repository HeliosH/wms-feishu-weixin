const api = require('../../../../utils/api')
const util = require('../../../../utils/util')

Page({
  data: { pendingUsers: [] },

  onShow() { this.loadPending() },

  async loadPending() {
    try {
      const all = await api.getUserList()
      const pending = all.filter(u => u.status === 'pending_review')
      this.setData({ pendingUsers: pending })
    } catch (err) { util.showToast(err.message) }
  },

  async onApprove(e) {
    const idx = e.currentTarget.dataset.index
    const user = this.data.pendingUsers[idx]
    wx.showModal({
      title: '确认通过',
      content: `通过 ${user.name || user.openid} 的借用人员权限申请？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.approveRole(user.openid, true, ['borrower'])
            util.showToast('已通过', 'success')
            this.loadPending()
          } catch (err) { util.showToast(err.message) }
        }
      }
    })
  },

  onReject(e) {
    const idx = e.currentTarget.dataset.index
    const user = this.data.pendingUsers[idx]
    wx.showModal({
      title: '驳回申请',
      content: `确定驳回 ${user.name || user.openid} 的申请？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.approveRole(user.openid, false, ['borrower'])
            util.showToast('已驳回', 'success')
            this.loadPending()
          } catch (err) { util.showToast(err.message) }
        }
      }
    })
  }
})
