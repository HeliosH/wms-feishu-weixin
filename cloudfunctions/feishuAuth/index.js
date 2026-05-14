const cloud = require('wx-server-sdk')
const axios = require('axios')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 配置读取优先级: 环境变量 > ./config.json > ../feishuConfig.json
let localConfig = { feishu: {} }
try { localConfig = require('./config.json') } catch (e) {
  try { localConfig = require('../feishuConfig.json') } catch (e2) {}
}
const KEY_MAP = { FEISHU_APP_ID: 'appId', FEISHU_APP_SECRET: 'appSecret' }
function getConfig(key) { return process.env[key] || localConfig.feishu[KEY_MAP[key]] || '' }

const TOKEN_CACHE_KEY = 'feishu_token_cache'
const TOKEN_EXPIRE_BUFFER = 300

async function getTenantAccessToken() {
  const db = cloud.database()
  const cacheRes = await db.collection('system_cache')
    .where({ key: TOKEN_CACHE_KEY })
    .get()

  if (cacheRes.data && cacheRes.data.length > 0) {
    const cached = cacheRes.data[0]
    if (cached.expire_at > Date.now() / 1000) {
      return cached.token
    }
  }

  const appId = getConfig('FEISHU_APP_ID')
  const appSecret = getConfig('FEISHU_APP_SECRET')

  if (!appId || !appSecret) {
    throw new Error('请配置飞书 App ID 和 App Secret（环境变量或在 config.json 中填写）')
  }

  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: appId,
    app_secret: appSecret
  }, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })

  if (res.data.code !== 0) {
    throw new Error(`获取飞书token失败: ${res.data.msg}`)
  }

  const token = res.data.tenant_access_token
  const expireIn = res.data.expire || 7200
  const expireAt = Math.floor(Date.now() / 1000) + expireIn - TOKEN_EXPIRE_BUFFER

  // 更新缓存
  if (cacheRes.data && cacheRes.data.length > 0) {
    await db.collection('system_cache')
      .doc(cacheRes.data[0]._id)
      .update({ token, expire_at: expireAt })
  } else {
    await db.collection('system_cache').add({
      data: { key: TOKEN_CACHE_KEY, token, expire_at: expireAt }
    })
  }

  return token
}

exports.main = async (event) => {
  try {
    const token = await getTenantAccessToken()
    return { code: 0, data: { token } }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}

// 导出给其他云函数使用
module.exports.getTenantAccessToken = getTenantAccessToken
