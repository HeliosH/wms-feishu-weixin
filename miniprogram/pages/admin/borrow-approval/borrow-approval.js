const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data: {
    records: []
  },

  onShow() {
    this.loadRecords()
  },

  async loadRecords() {
    try {
      const list = await api.getBorrowList({ status: 'pending_approval' })
      const records = list.map(r => ({
        ...r,
        apply_time_str: util.formatDate(r.apply_time)
      }))
      this.setData({ records })
    } catch (err) {
      util.showToast(err.message)
    }
  },

  async onApprove(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认审批',
      content: '确定通过此借用申请？',
      success: async (res) => {
        if (res.confirm) {
          util.showLoading('处理中')
          try {
            await api.approveBorrow(id)
            util.hideLoading()
            util.showToast('已通过', 'success')
            this.loadRecords()
          } catch (err) {
            util.hideLoading()
            util.showToast(err.message)
          }
        }
      }
    })
  },

  onReject(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '驳回申请',
      content: '请输入驳回原因',
      editable: true,
      placeholderText: '请输入驳回原因',
      success: async (res) => {
        if (res.confirm) {
          util.showLoading('处理中')
          try {
            await api.rejectBorrow(id, res.content || '')
            util.hideLoading()
            util.showToast('已驳回', 'success')
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
