App({
  onLaunch() {
    const token = require('./utils/token')
    token.initToken()
    this.globalData = {
      userInfo: null,
      openid: ''
    }
  },
  globalData: {
    userInfo: null,
    openid: ''
  }
})
