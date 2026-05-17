const auth = require('../utils/auth')
const role = require('../utils/role')

Component({
  data: {
    selected: 0,
    showManage: false
  },

  lifetimes: {
    attached() {
      this.updateRole()
    }
  },

  pageLifetimes: {
    show() {
      this.updateRole()
    }
  },

  methods: {
    updateRole() {
      const userInfo = auth.getUserInfo()
      const isAdmin = userInfo && role.isWarehouseAdmin(userInfo)
      this.setData({ showManage: isAdmin })
    },

    switchTab(e) {
      const { index, path } = e.currentTarget.dataset
      wx.switchTab({ url: path })
    }
  }
})
