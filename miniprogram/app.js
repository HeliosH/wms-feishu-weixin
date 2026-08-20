/**
 * App 全局逻辑
 * - token 初始化
 * - 用户信息缓存恢复
 * - 全局错误监听
 * - 网络状态检测
 * - 性能监控
 */
const token = require('./utils/token')
const auth = require('./utils/auth')

App({
  globalData: {
    userInfo: null,
    openid: '',
    networkType: 'unknown',
    isOnline: true,
    systemInfo: null
  },

  onLaunch() {
    // 初始化 token
    token.initToken()

    // 恢复缓存的用户信息
    auth.loadCachedUser()
    this.globalData.userInfo = auth.getUserInfo()

    // 获取系统信息（用于适配）
    this._initSystemInfo()

    // 网络状态监听
    this._initNetworkMonitor()

    // 全局错误捕获
    this._initErrorHandler()
  },

  /**
   * 获取系统信息，存入全局
   */
  _initSystemInfo() {
    try {
      const sysInfo = wx.getSystemInfoSync()
      this.globalData.systemInfo = sysInfo
    } catch (e) {
      console.error('[App] getSystemInfo failed', e)
    }
  },

  /**
   * 网络状态监听
   */
  _initNetworkMonitor() {
    wx.getNetworkType({
      success: (res) => {
        this.globalData.networkType = res.networkType
        this.globalData.isOnline = res.networkType !== 'none'
      }
    })

    wx.onNetworkStatusChange((res) => {
      this.globalData.networkType = res.networkType
      this.globalData.isOnline = res.isConnected

      if (!res.isConnected) {
        wx.showToast({ title: '网络已断开', icon: 'none' })
      } else if (res.networkType !== 'wifi' && res.networkType !== '5g' && res.networkType !== '4g') {
        // 2g/3g 网络提示
        console.warn('[App] weak network:', res.networkType)
      }
    })
  },

  /**
   * 全局错误处理
   */
  _initErrorHandler() {
    wx.onError((err) => {
      console.error('[App] onError:', err)
    })

    wx.onUnhandledRejection((res) => {
      console.error('[App] unhandled rejection:', res.reason)
    })
  }
})
