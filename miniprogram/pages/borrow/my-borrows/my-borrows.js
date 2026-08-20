const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const util = require('../../../utils/util')

const STATUS_MAP = {
  pending: 'pending_approval',
  approved: 'approved',
  collected: 'collected'
}

Page({
  data: {
    activeTab: 'pending',
    records: [],
    loading: false,
    statusLabel: '',
    statusTagClass: ''
  },

  onLoad(options) {
    // 支持 ?tab=pending|approved|collected 直达对应 tab
    if (options.tab && STATUS_MAP[options.tab]) {
      this.setData({ activeTab: options.tab })
    }
    this.loadRecords()
  },

  onShow() {
    this.loadRecords()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    this.loadRecords()
  },

  async loadRecords() {
    this.setData({ loading: true })
    const status = STATUS_MAP[this.data.activeTab]
    const statusLabel = util.getStatusLabel(status)
    const statusTagClass = util.getStatusTagClass(status)
    this.setData({ statusLabel, statusTagClass })

    try {
      const userInfo = auth.getUserInfo()
      const list = await api.getBorrowList({
        borrowerId: userInfo.openid,
        status
      })
      this.setData({ records: list })
    } catch (err) {
      util.showToast(err.message)
    } finally {
      this.setData({ loading: false })
    }
  },

  formatTime(time) {
    return util.formatDate(time)
  }
})
