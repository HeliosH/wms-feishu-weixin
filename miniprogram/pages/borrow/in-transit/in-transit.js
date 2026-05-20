const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const util = require('../../../utils/util')

Page({
  data: {
    activeTab: 'borrow',
    borrowRecords: [],
    returnRecords: [],
    loading: false
  },

  onShow() {
    this.loadData()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  async loadData() {
    this.setData({ loading: true })
    const userInfo = auth.getUserInfo()
    if (!userInfo) { this.setData({ loading: false }); return }

    try {
      const [pending, approved, collected] = await Promise.all([
        api.getBorrowList({ borrowerId: userInfo.openid, status: 'pending_approval' }),
        api.getBorrowList({ borrowerId: userInfo.openid, status: 'approved' }),
        api.getBorrowList({ borrowerId: userInfo.openid, status: 'collected' })
      ])

      this.setData({
        borrowRecords: [...pending, ...approved].map(r => ({
          ...r,
          statusLabel: util.getStatusLabel(r.status),
          statusTagClass: util.getStatusTagClass(r.status),
          apply_time_str: util.formatDate(r.apply_time)
        })),
        returnRecords: collected.map(r => ({
          ...r,
          statusLabel: util.getStatusLabel(r.status),
          statusTagClass: util.getStatusTagClass(r.status),
          collect_time_str: util.formatDate(r.collect_time)
        }))
      })
    } catch (err) {
      /* ignore */
    } finally {
      this.setData({ loading: false })
    }
  }
})
