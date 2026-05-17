let _token = ''
const TOKEN_KEY = 'auth_token'

function getToken() {
  return _token
}

function setToken(t) {
  _token = t
  if (t) {
    wx.setStorageSync(TOKEN_KEY, t)
  } else {
    wx.removeStorageSync(TOKEN_KEY)
  }
}

function initToken() {
  _token = wx.getStorageSync(TOKEN_KEY) || ''
}

module.exports = { getToken, setToken, initToken }
