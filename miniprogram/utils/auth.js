/**
 * 用户认证状态管理
 */
const authService = require('../services/auth.service')
const userService = require('../services/user.service')
const token = require('./token')
const { USER_INFO_KEY } = require('./config')

let _userInfo = null

function getUserInfo() {
  return _userInfo
}

function setUserInfo(info) {
  _userInfo = info || null
  if (info) {
    wx.setStorageSync(USER_INFO_KEY, info)
  } else {
    wx.removeStorageSync(USER_INFO_KEY)
  }
}

function loadCachedUser() {
  const cached = wx.getStorageSync(USER_INFO_KEY)
  if (cached) {
    _userInfo = cached
  }
  return cached
}

function isLoggedIn() {
  return !!_userInfo
}

function checkLogin() {
  if (!isLoggedIn()) {
    wx.redirectTo({ url: '/pages/login/login' })
    return false
  }
  return true
}

function goHome() {
  wx.switchTab({ url: '/pages/index/index' })
}

/**
 * 完整登录流程：wx.login → 换 JWT → 获取用户信息
 */
async function doLogin() {
  // Step 1: wx.login 获取 code
  const { code } = await new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject })
  })

  if (!code) throw new Error('微信登录失败：未获取到 code')

  // Step 2: 用 code 换 JWT token
  const authData = await authService.authLogin(code)
  token.setToken(authData.token)

  // Step 3: 获取用户信息
  const userInfo = await userService.login()
  setUserInfo(userInfo)
  return userInfo
}

function logout() {
  token.setToken('')
  setUserInfo(null)
  wx.reLaunch({ url: '/pages/login/login' })
}

module.exports = {
  getUserInfo,
  setUserInfo,
  loadCachedUser,
  isLoggedIn,
  checkLogin,
  doLogin,
  logout,
  goHome
}
