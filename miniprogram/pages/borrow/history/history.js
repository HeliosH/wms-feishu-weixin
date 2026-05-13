const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const util = require('../../../utils/util')

Page({
  data: {
    records: [],
    statusOptions: [
      { value: '', label: '全部状态' },
      { value: 'pending_approval', label: '待审批' },
      { value: 'approved', label: '已通过' },
      { value: 'rejected', label: '已驳回' },
      { value: 'collected', label: '已领取' },
      { value: 'returned', label: '已归还' }
    ],
    selectedStatus: '',
    selectedStatusLabel: '全部状态',
    loading: false
  },

  onLoad() {
    this.loadRecords()
  },

  onShow() {
    this.loadRecords()
  },

  onStatusFilter(e) {
    const idx = e.detail.value
    const option = this.data.statusOptions[idx]
    this.setData({
      selectedStatus: option.value,
      selectedStatusLabel: option.label
    })
    this.loadRecords()
  },

  async loadRecords() {
    this.setData({ loading: true })
    try {
      const userInfo = auth.getUserInfo()
      const params = { borrowerId: userInfo.openid }
      if (this.data.selectedStatus) {
        params.status = this.data.selectedStatus
      }
      const list = await api.getBorrowList(params)
      const records = list.map(r => ({
        ...r,
        statusLabel: util.getStatusLabel(r.status),
        statusTagClass: util.getStatusTagClass(r.status),
        apply_time_str: util.formatDate(r.apply_time),
        approve_time_str: util.formatDate(r.approve_time),
        collect_time_str: util.formatDate(r.collect_time),
        return_time_str: util.formatDate(r.return_time)
      }))
      this.setData({ records })
    } catch (err) {
      util.showToast(err.message)
    } finally {
      this.setData({ loading: false })
    }
  }
})
