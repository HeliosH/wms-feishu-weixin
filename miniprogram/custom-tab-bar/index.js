const auth = require('../utils/auth')
const role = require('../utils/role')

// Tab 定义：index 对应 app.json tabBar.list 的顺序
// 0 首页 / 1 借用 / 2 管理 / 3 我的
const TABS = [
  { index: 0, path: '/pages/index/index', text: '首页', icon: 'home' },
  { index: 1, path: '/pages/borrow/borrow', text: '借用', icon: 'box' },
  { index: 2, path: '/pages/manage/manage', text: '管理', icon: 'settings', adminOnly: true },
  { index: 3, path: '/pages/mine/mine', text: '我的', icon: 'user' }
]

Component({
  data: {
    selected: 0,
    tabs: []
  },

  lifetimes: {
    attached() {
      this.updateTabs()
    }
  },

  pageLifetimes: {
    show() {
      this.updateTabs()
    }
  },

  methods: {
    updateTabs() {
      const userInfo = auth.getUserInfo()
      const isAdmin = userInfo && role.isWarehouseAdmin(userInfo)
      this.setData({
        tabs: TABS.filter(t => !t.adminOnly || isAdmin)
      })
    },

    switchTab(e) {
      const { path } = e.currentTarget.dataset
      wx.switchTab({ url: path })
    }
  }
})
