/**
 * 环境配置
 *
 * 传输模式（TRANSPORT）：
 *   - 'http'：走自建 Express 服务（本地开发/调试，需先 npm run server）
 *   - 'cloud'：走微信云函数（生产方案，免域名白名单）
 *
 * 切换到 cloud 模式前需：
 *   1. 开通微信云开发环境，将环境 ID 填入 CLOUD_ENV
 *   2. app.js 会自动 wx.cloud.init
 *   3. 上传 cloudfunctions/ 下的云函数（见 cloudfunctions/README.md）
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

// 传输模式：develop 走本地 HTTP（便于调试与 UI 测试），线上走云函数
// 本地想验证云函数链路时，把 FORCE_TRANSPORT 改为 'cloud' 并填好 CLOUD_ENV
const TRANSPORT_MAP = {
  develop: 'http',
  trial: 'cloud',
  release: 'cloud'
}
const FORCE_TRANSPORT = '' // '' | 'http' | 'cloud'（手动覆盖，留空则按环境自动）

// 微信云开发环境 ID（开通云开发后在控制台查看，形如 cloud1-2g5xxx）
const CLOUD_ENV = ''

// 云函数名映射（URL 前缀 → 云函数）
const CLOUD_FUNCTIONS = {
  user: 'userManage',
  item: 'itemManage',
  borrow: 'borrowManage'
}

const config = {
  BASE_URL: ENV_MAP[envVersion] || ENV_MAP.develop,

  // 静态资源根地址（与 BASE_URL 同源，无 /api 后缀）
  SERVER_URL: SERVER_URL_MAP[envVersion] || SERVER_URL_MAP.develop,

  // 传输模式
  TRANSPORT: FORCE_TRANSPORT || TRANSPORT_MAP[envVersion] || TRANSPORT_MAP.develop,
  CLOUD_ENV,
  CLOUD_FUNCTIONS,

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
