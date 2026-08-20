/**
 * 核心请求封装
 * 统一处理鉴权、超时、重试、401 自动刷新 token
 *
 * 传输模式（config.TRANSPORT）：
 *   - 'http'：wx.request → Express 服务（本地开发），401 → 静默刷新 token 重试
 *   - 'cloud'：wx.cloud.callFunction → 云函数（生产），OPENID 免鉴权，无 401 概念
 *
 * 两种模式的响应契约一致：{ code: 0, data } / { code: -1, message }
 *
 * 401 处理策略（仅 http 模式）：
 *   1. 请求收到 401 → 进入等待队列
 *   2. 首个触发者执行静默刷新（wx.login → 公共路由 /auth/login，该路由不会 401）
 *   3. 刷新成功 → 队列中的请求携带新 token 重试
 *   4. 刷新失败 → 清空队列并强制退出登录
 */
const config = require('./config')
const token = require('./token')

let _isRefreshing = false
let _requestQueue = []

/**
 * URL → 云函数名（'/user' → 'userManage'）
 */
function _resolveCloudFunction(url) {
  const path = url.replace(/^\//, '').split('/')[0] // e.g. 'user'
  return config.CLOUD_FUNCTIONS[path]
}

/**
 * 云函数模式请求
 */
function cloudRequest(url, data, options = {}) {
  const { skipToast = false, retryCount = config.RETRY_COUNT } = options
  const funcName = _resolveCloudFunction(url)
  if (!funcName) {
    return Promise.reject({ code: -1, message: `云函数模式下不支持该路由: ${url}` })
  }

  return new Promise((resolve, reject) => {
    const doCall = (attempt) => {
      wx.cloud.callFunction({
        name: funcName,
        data: data || {},
        success(res) {
          const result = res.result
          if (result && result.code === 0) {
            resolve(result.data)
          } else {
            const errMsg = (result && result.message) || '请求失败'
            if (!skipToast) _toast(errMsg)
            reject(result || { code: -1, message: errMsg })
          }
        },
        fail(err) {
          // 网络错误重试（指数退避）
          if (attempt < retryCount) {
            setTimeout(() => doCall(attempt + 1), 1000 * (attempt + 1))
            return
          }
          const errMsg = _getCloudError(err)
          if (!skipToast) _toast(errMsg)
          reject({ code: -1, message: errMsg, detail: err })
        }
      })
    }

    doCall(0)
  })
}

function _getCloudError(err) {
  if (!err) return '云函数调用失败'
  const msg = err.errMsg || ''
  if (msg.includes('not found')) return '云函数不存在，请先上传部署'
  if (msg.includes('env')) return '云开发环境错误，请检查 CLOUD_ENV 配置'
  if (msg.includes('timeout')) return '请求超时，请检查网络'
  return '云函数调用失败，请稍后重试'
}

/**
 * 基础请求方法
 * @param {string} method - GET / POST
 * @param {string} url - 路径（不含 BASE_URL）
 * @param {object} data - 请求数据
 * @param {object} options - { skipAuth, skipToast, retryCount, _isRetry }
 * @returns {Promise<any>}
 */
function request(method, url, data, options = {}) {
  // 云函数模式：method 无意义（云函数内自行路由），数据透传
  if (config.TRANSPORT === 'cloud') {
    return cloudRequest(url, data, options)
  }

  const { skipAuth = false, skipToast = false, retryCount = config.RETRY_COUNT } = options
  const fullUrl = config.BASE_URL + url
  const headers = { 'Content-Type': 'application/json' }

  if (!skipAuth) {
    const t = token.getToken()
    if (t) headers['Authorization'] = 'Bearer ' + t
  }

  return new Promise((resolve, reject) => {
    const doRequest = (attempt) => {
      wx.request({
        method,
        url: fullUrl,
        data,
        timeout: config.REQUEST_TIMEOUT,
        header: headers,
        enableHttp2: true,
        success(res) {
          if (res.statusCode === 401) {
            if (skipAuth || options._isRetry) {
              // 新 token 仍被拒绝（如账号被禁用）→ 会话失效
              if (options._isRetry) _forceLogout()
              reject({ code: 401, message: '登录已过期，请重新登录' })
              return
            }
            // token 过期 → 刷新后重试
            _handleTokenExpired(method, url, data, options)
              .then(resolve)
              .catch(reject)
            return
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (res.data && res.data.code === 0) {
              resolve(res.data.data)
            } else {
              const errMsg = (res.data && res.data.message) || '请求失败'
              if (!skipToast) _toast(errMsg)
              reject(res.data || { code: -1, message: errMsg })
            }
          } else {
            const errMsg = `服务器错误 (${res.statusCode})`
            if (!skipToast) _toast(errMsg)
            reject({ code: res.statusCode, message: errMsg })
          }
        },
        fail(err) {
          // 网络错误重试（指数退避）
          if (attempt < retryCount) {
            setTimeout(() => doRequest(attempt + 1), 1000 * (attempt + 1))
            return
          }
          const errMsg = _getNetworkError(err)
          if (!skipToast) _toast(errMsg)
          reject({ code: -1, message: errMsg, detail: err })
        }
      })
    }

    doRequest(0)
  })
}

/**
 * token 过期处理：静默刷新后重试队列中的请求
 */
function _handleTokenExpired(method, url, data, options) {
  return new Promise((resolve, reject) => {
    // 所有 401 请求进入队列等待重试
    _requestQueue.push({ method, url, data, options, resolve, reject })

    if (_isRefreshing) return

    _isRefreshing = true
    _refreshToken()
      .then(() => {
        _isRefreshing = false
        const queue = _requestQueue
        _requestQueue = []
        queue.forEach((task) => {
          request(task.method, task.url, task.data, { ...task.options, _isRetry: true })
            .then(task.resolve)
            .catch(task.reject)
        })
      })
      .catch((err) => {
        _isRefreshing = false
        const queue = _requestQueue
        _requestQueue = []
        queue.forEach((task) => task.reject(err))
        // 刷新失败（如账号被禁用）→ 强制退出
        _forceLogout()
      })
  })
}

/**
 * 静默刷新 token：wx.login → 公共路由换新 JWT
 * 注意：只走公共路由 /auth/login，不会产生 401，避免递归
 */
async function _refreshToken() {
  const { code } = await new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject })
  })
  if (!code) throw new Error('微信登录失败')

  const authService = require('../services/auth.service')
  const authData = await authService.authLogin(code)
  token.setToken(authData.token)
}

/**
 * 强制退出登录（延迟 require 避免循环依赖）
 */
function _forceLogout() {
  try {
    const auth = require('./auth')
    auth.logout()
  } catch (e) { /* ignore */ }
}

/**
 * toast（延迟 require 避免循环依赖）
 */
function _toast(msg) {
  const { showToast } = require('./util')
  showToast(msg)
}

function _getNetworkError(err) {
  if (!err) return '网络错误'
  if (err.errMsg && err.errMsg.includes('timeout')) return '请求超时，请检查网络'
  if (err.errMsg && err.errMsg.includes('fail')) return '网络连接失败，请检查网络'
  return '网络错误，请稍后重试'
}

/**
 * 文件上传
 */
function uploadFile(filePath, name = 'photo') {
  const fullUrl = config.BASE_URL + '/upload'
  const t = token.getToken()

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: fullUrl,
      filePath,
      name,
      header: t ? { 'Authorization': 'Bearer ' + t } : {},
      timeout: config.REQUEST_TIMEOUT,
      success(res) {
        try {
          const data = JSON.parse(res.data)
          if (data.code === 0) {
            resolve(data.data.url)
          } else {
            reject(data)
          }
        } catch (e) {
          reject({ code: -1, message: '上传响应解析失败' })
        }
      },
      fail(err) {
        reject({ code: -1, message: _getNetworkError(err), detail: err })
      }
    })
  })
}

module.exports = {
  request,
  uploadFile
}
