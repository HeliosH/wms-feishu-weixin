const api = require('./api')

let _userInfo = null
let _token = ''

const TOKEN_KEY = 'auth_token'

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

function getToken() {
  return _token
}

function initToken() {
  _token = wx.getStorageSync(TOKEN_KEY) || ''
}

async function doLogin() {
  const code = await new Promise((resolve, reject) => {
    wx.login({ success: res => resolve(res.code), fail: reject })
  })

  const authData = await api.authLogin(code)
  _token = authData.token
  wx.setStorageSync(TOKEN_KEY, _token)

  const userInfo = await api.login()
  setUserInfo(userInfo)
  return userInfo
}

function logout() {
  _token = ''
  wx.removeStorageSync(TOKEN_KEY)
  setUserInfo(null)
  wx.redirectTo({ url: '/pages/login/login' })
}

module.exports = {
  getUserInfo,
  setUserInfo,
  loadCachedUser,
  isLoggedIn,
  checkLogin,
  doLogin,
  logout,
  getToken,
  initToken
}
