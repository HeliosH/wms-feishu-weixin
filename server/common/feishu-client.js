const axios = require('axios')

// 支持 FEISHU_BASE_URL 覆盖（用于本地 E2E 测试 mock，默认为真实飞书地址）
const FEISHU_BASE_URL = process.env.FEISHU_BASE_URL || 'https://open.feishu.cn'
const FEISHU_AUTH_URL = `${FEISHU_BASE_URL}/open-apis/auth/v3/tenant_access_token/internal`
const FEISHU_BITABLE_BASE = `${FEISHU_BASE_URL}/open-apis/bitable/v1/apps`

/**
 * @param {Object} config
 * @param {string} config.appId
 * @param {string} config.appSecret
 * @param {string} config.bitableAppToken
 * @param {Object} config.cache - { get(key): Promise<string|null>, set(key, token, expireAt): Promise<void> }
 */
function createFeishuClient(config) {
  const { appId, appSecret, bitableAppToken, cache } = config
  const BASE = `${FEISHU_BITABLE_BASE}/${bitableAppToken}`

  async function getToken() {
    const cached = await cache.get('feishu_token_cache')
    if (cached) return cached

    const res = await axios.post(FEISHU_AUTH_URL, {
      app_id: appId,
      app_secret: appSecret
    }, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })

    if (res.data.code !== 0) {
      throw new Error(`获取飞书token失败: ${res.data.msg}`)
    }

    const token = res.data.tenant_access_token
    const expireAt = Math.floor(Date.now() / 1000) + (res.data.expire || 7200) - 300
    await cache.set('feishu_token_cache', token, expireAt)
    return token
  }

  async function request(method, path, data = null, params = null) {
    const token = await getToken()
    const reqConfig = {
      method,
      url: `${BASE}${path}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      }
    }
    if (data) reqConfig.data = data
    if (params) reqConfig.params = params

    const res = await axios(reqConfig)
    if (res.data.code !== 0) {
      throw new Error(`飞书API错误: ${res.data.msg}`)
    }
    return res.data.data
  }

  return { request, getToken }
}

function fromRecord(record) {
  return { _id: record.record_id, ...record.fields }
}

function toBitableFields(data) {
  const fields = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      fields[key] = value
    }
  }
  return fields
}

module.exports = { createFeishuClient, fromRecord, toBitableFields }
