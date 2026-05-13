const api = require('./api')

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

async function doLogin() {
  const res = await api.login()
  setUserInfo(res)
  return res
}

function logout() {
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
  logout
}
