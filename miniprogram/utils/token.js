/**
 * Token 管理
 * 内存 + Storage 双层存储
 */
const { TOKEN_KEY } = require('./config')

let _token = ''

function getToken() {
  return _token
}

function setToken(t) {
  _token = t || ''
  if (_token) {
    wx.setStorageSync(TOKEN_KEY, _token)
  } else {
    wx.removeStorageSync(TOKEN_KEY)
  }
}

function initToken() {
  _token = wx.getStorageSync(TOKEN_KEY) || ''
}

module.exports = { getToken, setToken, initToken }
