/**
 * 照片附件统一处理
 *
 * 约定：
 *   - 业务字段（apply_photo / collect_photo / return_photo / avatar_url）为文本字段，存 URL
 *   - 附件字段（*_file）为飞书附件字段（type 17），存 [{ file_token }]
 *   - 判定规则：值为 file_token（非 "/" 或 http 开头的字符串）→ 写附件字段；否则写文本字段
 *   - 读取时：附件字段的 file_token 批量换取 24h 临时 URL，回填到业务字段（附件优先，文本兜底）
 *
 * 临时 URL 缓存：进程内缓存 23 小时（URL 有效期 24h），减少飞书 API 调用（频控 5 QPS）
 */

// 业务文本字段 → 附件字段 映射
const BORROW_PHOTO_FIELDS = {
  apply_photo: 'apply_photo_file',
  collect_photo: 'collect_photo_file',
  return_photo: 'return_photo_file'
}

const USER_AVATAR_FIELDS = {
  avatar_url: 'avatar_file'
}

// file_token 缓存: token → { url, expireAt }
const _urlCache = new Map()
const URL_CACHE_TTL = 23 * 60 * 60 * 1000 // 23h（URL 有效期 24h）

/**
 * 判断值是否为飞书 file_token（非 URL 的非空字符串）
 */
function isFileToken(value) {
  return typeof value === 'string' && value.length > 0 &&
    !value.startsWith('/') && !value.startsWith('http')
}

/**
 * 构造照片写入字段（原地修改 fields）
 * @param {object} fields - 待写入的字段对象
 * @param {string} textField - 业务文本字段名（如 apply_photo）
 * @param {string} attachField - 附件字段名（如 apply_photo_file）
 * @param {string} value - photoUrl（URL 或 file_token）或空
 */
function buildPhotoField(fields, textField, attachField, value) {
  if (!value) {
    fields[textField] = ''
    return
  }
  if (isFileToken(value)) {
    fields[attachField] = [{ file_token: value }]
    fields[textField] = ''
  } else {
    fields[textField] = value
  }
}

/**
 * 从记录中提取附件 file_token（跳过已缓存的）
 */
function _collectTokens(records, fieldMap) {
  const need = []
  for (const record of records) {
    for (const attachField of Object.values(fieldMap)) {
      const arr = record[attachField]
      if (Array.isArray(arr) && arr[0] && arr[0].file_token) {
        const token = arr[0].file_token
        const cached = _urlCache.get(token)
        if (!cached || cached.expireAt < Date.now()) need.push(token)
      }
    }
  }
  return need
}

/**
 * 解析记录中的照片附件为临时 URL，回填到业务字段（原地修改）
 * @param {object} client - feishu client（需支持 getTmpDownloadUrls）
 * @param {Array<object>} records - fromRecord 后的记录数组
 * @param {object} fieldMap - { 业务字段: 附件字段 }，默认借用照片字段
 */
async function resolveRecordPhotos(client, records, fieldMap = BORROW_PHOTO_FIELDS) {
  if (!records || records.length === 0) return records

  const tokens = _collectTokens(records, fieldMap)
  if (tokens.length > 0) {
    const urlMap = await client.getTmpDownloadUrls(tokens)
    const now = Date.now()
    for (const [token, url] of urlMap.entries()) {
      _urlCache.set(token, { url, expireAt: now + URL_CACHE_TTL })
    }
  }

  for (const record of records) {
    for (const [textField, attachField] of Object.entries(fieldMap)) {
      const arr = record[attachField]
      if (Array.isArray(arr) && arr[0] && arr[0].file_token) {
        const cached = _urlCache.get(arr[0].file_token)
        if (cached && cached.expireAt > Date.now()) {
          record[textField] = cached.url
        }
      }
    }
  }
  return records
}

/**
 * 清空临时 URL 缓存（测试用）
 */
function clearPhotoUrlCache() {
  _urlCache.clear()
}

module.exports = {
  BORROW_PHOTO_FIELDS,
  USER_AVATAR_FIELDS,
  isFileToken,
  buildPhotoField,
  resolveRecordPhotos,
  clearPhotoUrlCache
}
