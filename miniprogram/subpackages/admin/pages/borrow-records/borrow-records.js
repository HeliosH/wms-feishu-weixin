const util = require('../../../../utils/util')
const { BORROW_STATUS, BORROW_STATUS_LABELS, BORROW_STATUS_TAG_CLASS } = require('../../../../utils/constants')
const { borrowService } = require('../../../../services/index')

// Tab 定义：key 与首页管理员统计卡跳转参数一一对应
const TABS = [
  { key: 'active', label: '进行中' },
  { key: 'borrow', label: '借用流程' },
  { key: 'return', label: '归还流程' },
  { key: 'returned', label: '已归还' }
]

const BORROWING_STATUSES = [BORROW_STATUS.PENDING_APPROVAL, BORROW_STATUS.APPROVED]
const ACTIVE_STATUSES = [...BORROWING_STATUSES, BORROW_STATUS.COLLECTED]

Page({
  data: {
    tabs: TABS,
    activeTab: 'active',
    records: [],
    loading: true
  },

  onLoad(options) {
    // 支持 ?tab=active|borrow|return|returned 直达
    if (options.tab && TABS.some(t => t.key === options.tab)) {
      this.setData({ activeTab: options.tab })
    }
  },

  onShow() {
    this.loadRecords()
  },

  onPullDownRefresh() {
    this.loadRecords().then(() => wx.stopPullDownRefresh())
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    this.applyFilter(this._allRecords || [])
  },

  /**
   * 一次拉取全部记录，客户端按状态分组过滤
   */
  async loadRecords() {
    this.setData({ loading: true })
    try {
      const list = await borrowService.getBorrowList({})
      this._allRecords = list
      this.applyFilter(list)
    } catch (err) { /* 错误已由 request 层统一 toast */ } finally {
      this.setData({ loading: false })
    }
  },

  applyFilter(list) {
    const tab = this.data.activeTab
    let filtered
    if (tab === 'active') {
      // 进行中 = 借用流程 + 归还流程
      filtered = list.filter(r => ACTIVE_STATUSES.includes(r.status))
    } else if (tab === 'borrow') {
      // 借用流程 = 待审批 + 待领取
      filtered = list.filter(r => BORROWING_STATUSES.includes(r.status))
    } else if (tab === 'return') {
      // 归还流程 = 借出在外，待归还
      filtered = list.filter(r => r.status === BORROW_STATUS.COLLECTED)
    } else {
      filtered = list.filter(r => r.status === BORROW_STATUS.RETURNED)
    }

    const records = filtered.map(r => ({
      ...r,
      statusLabel: BORROW_STATUS_LABELS[r.status] || r.status,
      statusTagClass: BORROW_STATUS_TAG_CLASS[r.status] || 'tag-gray',
      apply_time_str: util.formatDate(r.apply_time)
    }))

    this.setData({ records })
  }
})
