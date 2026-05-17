const api = require('./api')
const token = require('./token')

let _userInfo = null

function getUserInfo() {
  return _userInfo
}

function setUserInfo(info) {
  _userInfo = info
  if (info) {
    wx.setStorageSync('userInfo', info)
  } else {
    wx.removeStorageSync('userInfo')
  }
}

function loadCachedUser() {
  const cached = wx.getStorageSync('userInfo')
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
  wx.switchTab({ url: '/pages/borrow/borrow' })
}

async function doLogin() {
  const code = await new Promise((resolve, reject) => {
    wx.login({ success: res => resolve(res.code), fail: reject })
  })

  console.log('[AUTH doLogin] wx.login code obtained')
  const authData = await api.authLogin(code)
  console.log('[AUTH doLogin] authLogin response:', JSON.stringify(authData))
  token.setToken(authData.token)

  const userInfo = await api.login()
  console.log('[AUTH doLogin] login response userInfo:', JSON.stringify(userInfo))
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
