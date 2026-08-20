/**
 * 认证服务
 */
const { request } = require('../utils/request')

/**
 * 微信登录换取 JWT token
 * @param {string} code - wx.login 获取的 code
 * @returns {Promise<{token: string, openid: string, expiresIn: number}>}
 */
function authLogin(code) {
  return request('POST', '/auth/login', { code }, { skipAuth: true, skipToast: true })
}

module.exports = {
  authLogin
}
