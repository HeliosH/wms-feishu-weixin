const axios = require('axios')

// 支持 FEISHU_BASE_URL 覆盖（用于本地 E2E 测试 mock，默认为真实飞书地址）
const FEISHU_BASE_URL = process.env.FEISHU_BASE_URL || 'https://open.feishu.cn'
const FEISHU_AUTH_URL = `${FEISHU_BASE_URL}/open-apis/auth/v3/tenant_access_token/internal`
const FEISHU_BITABLE_BASE = `${FEISHU_BASE_URL}/open-apis/bitable/v1/apps`
const FEISHU_MEDIA_UPLOAD_URL = `${FEISHU_BASE_URL}/open-apis/drive/v1/medias/upload_all`
const FEISHU_MEDIA_TMP_URL = `${FEISHU_BASE_URL}/open-apis/drive/v1/medias/batch_get_tmp_download_url`

/**
 * 手工构造 multipart/form-data 请求体（避免引入 form-data 依赖）
 */
function buildMultipart(fields, fileField, fileName, buffer) {
  const boundary = `----wmsboundary${Date.now()}${Math.random().toString(16).slice(2)}`
  const parts = []
  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    ))
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  ))
  parts.push(buffer)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`
  }
}

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

  /**
   * 上传素材到多维表格（用于附件字段）
   * 文档: https://open.feishu.cn/document/server-docs/docs/drive-v1/media/upload_all
   * @param {Buffer} buffer - 文件内容
   * @param {string} fileName - 文件名（带扩展名）
   * @returns {Promise<string>} file_token
   */
  async function uploadMedia(buffer, fileName) {
    const token = await getToken()
    const { body, contentType } = buildMultipart({
      file_name: fileName,
      parent_type: 'bitable_image',
      parent_node: bitableAppToken,
      size: buffer.length
    }, 'file', fileName, buffer)

    const res = await axios.post(FEISHU_MEDIA_UPLOAD_URL, body, {
      maxBodyLength: Infinity,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': contentType
      }
    })
    if (res.data.code !== 0) {
      throw new Error(`飞书上传素材失败: ${res.data.msg}`)
    }
    return res.data.data.file_token
  }

  /**
   * 批量获取素材临时下载链接（24 小时有效，单次最多 5 个，频控 5 QPS）
   * @param {string[]} fileTokens
   * @returns {Promise<Map<string, string>>} file_token → tmp_download_url
   */
  async function getTmpDownloadUrls(fileTokens) {
    const result = new Map()
    for (let i = 0; i < fileTokens.length; i += 5) {
      const chunk = fileTokens.slice(i, i + 5)
      const query = chunk.map(t => `file_tokens=${encodeURIComponent(t)}`).join('&')
      const token = await getToken()
      const res = await axios.get(`${FEISHU_MEDIA_TMP_URL}?${query}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.data.code !== 0) {
        throw new Error(`飞书获取临时链接失败: ${res.data.msg}`)
      }
      for (const item of res.data.data.tmp_download_urls || []) {
        result.set(item.file_token, item.tmp_download_url)
      }
    }
    return result
  }

  return { request, getToken, uploadMedia, getTmpDownloadUrls }
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
