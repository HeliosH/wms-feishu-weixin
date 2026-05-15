App({
  onLaunch() {
    const auth = require('./utils/auth')
    auth.initToken()
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
