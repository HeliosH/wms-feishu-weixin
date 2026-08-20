/**
 * 环境配置
 * 线上部署时将 BASE_URL 改为正式 HTTPS 域名，并在小程序后台配置 request 合法域名
 */

// 通过 __wxConfig.envVersion 判断环境（develop / trial / release）
const envVersion = typeof __wxConfig !== 'undefined'
  ? __wxConfig.envVersion
  : 'develop'

// 与 server/.env 中的 SERVER_PORT 保持一致
const ENV_MAP = {
  develop: 'http://localhost:8080/api',
  trial: 'https://your-staging.example.com/api',
  release: 'https://your-prod.example.com/api'
}

// 服务器根地址（用于图片等静态资源，上传接口返回 /uploads/... 相对路径）
const SERVER_URL_MAP = {
  develop: 'http://localhost:8080',
  trial: 'https://your-staging.example.com',
  release: 'https://your-prod.example.com'
}

const config = {
  BASE_URL: ENV_MAP[envVersion] || ENV_MAP.develop,

  // 静态资源根地址（与 BASE_URL 同源，无 /api 后缀）
  SERVER_URL: SERVER_URL_MAP[envVersion] || SERVER_URL_MAP.develop,

  // 请求超时（毫秒）
  REQUEST_TIMEOUT: 15000,

  // 请求重试次数
  RETRY_COUNT: 1,

  // 文件上传大小限制（字节）
  UPLOAD_MAX_SIZE: 10 * 1024 * 1024,

  // token storage key
  TOKEN_KEY: 'auth_token',

  // 用户信息 storage key
  USER_INFO_KEY: 'userInfo'
}

module.exports = config
