const auth = require('../../utils/auth')
const util = require('../../utils/util')

Page({
  data: {
    loading: false
  },

  onLoad() {
    auth.loadCachedUser()
    if (auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },

  async onLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const userInfo = await auth.doLogin()
      util.showToast('登录成功', 'success')
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' })
      }, 500)
    } catch (err) {
      util.showToast(err.message || '登录失败')
    } finally {
      this.setData({ loading: false })
    }
  }
})
