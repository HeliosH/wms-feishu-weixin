const util = require('../../../../utils/util')
const { borrowService } = require('../../../../services/index')

Page({
  data: {
    records: [],
    loading: true
  },

  onShow() {
    this.loadRecords()
  },

  async loadRecords() {
    this.setData({ loading: true })
    try {
      const list = await borrowService.getBorrowList({ status: 'pending_approval' })
      const records = list.map(r => ({
        ...r,
        apply_time_str: util.formatDate(r.apply_time)
      }))
      this.setData({ records })
    } catch (err) { /* 错误已由 request 层统一 toast */ } finally {
      this.setData({ loading: false })
    }
  },

  async onApprove(e) {
    const id = e.currentTarget.dataset.id
    const confirmed = await util.confirm('确认审批', '确定通过此借用申请？')
    if (!confirmed) return

    util.showLoading('处理中')
    try {
      await borrowService.approveBorrow(id)
      util.hideLoading()
      util.showToast('已通过', 'success')
      this.loadRecords()
    } catch (err) {
      util.hideLoading()
      util.showToast(err.message || '操作失败')
    }
  },

  async onReject(e) {
    const id = e.currentTarget.dataset.id
    const reason = await util.prompt('驳回申请', '请输入驳回原因')
    if (reason === null) return

    util.showLoading('处理中')
    try {
      await borrowService.rejectBorrow(id, reason || '')
      util.hideLoading()
      util.showToast('已驳回', 'success')
      this.loadRecords()
    } catch (err) {
      util.hideLoading()
      util.showToast(err.message || '操作失败')
    }
  }
})
