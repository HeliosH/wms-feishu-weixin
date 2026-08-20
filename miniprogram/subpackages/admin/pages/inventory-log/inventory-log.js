const api = require('../../../../utils/api')
const util = require('../../../../utils/util')

Page({
  data: {
    logs: [],
    itemId: ''
  },

  onLoad(options) {
    if (options.itemId) {
      this.setData({ itemId: options.itemId })
    }
    this.loadLogs()
  },

  async loadLogs() {
    try {
      const params = {}
      if (this.data.itemId) params.itemId = this.data.itemId
      const list = await api.getInventoryLogs(params)
      const logs = list.map(l => ({
        ...l,
        changeTypeLabel: util.getChangeTypeLabel(l.change_type),
        changeTypeTag: l.change_type === 'borrow' ? 'tag-orange' :
          l.change_type === 'return' ? 'tag-green' :
          l.change_type === 'stock_in' ? 'tag-blue' : 'tag-gray',
        created_at_str: util.formatDate(l.created_at)
      }))
      this.setData({ logs })
    } catch (err) {
      util.showToast(err.message)
    }
  }
})
