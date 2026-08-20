/**
 * 文件上传服务
 *
 * 两种模式统一返回 { token, url }：
 *   - token：提交到后端的存储值（http 模式为服务器相对路径；cloud 模式为飞书 file_token）
 *   - url：可直接用于 <image> 预览的完整 URL
 */
const { request, uploadFile } = require('../utils/request')
const config = require('../utils/config')
const { resolveFileUrl } = require('../utils/util')

/**
 * 云函数模式上传：本地文件 → 云存储 → 飞书附件
 * @param {string} filePath
 * @returns {Promise<{token: string, url: string}>}
 */
function cloudUploadPhoto(filePath) {
  return new Promise((resolve, reject) => {
    const ext = filePath.match(/\.(png|jpg|jpeg|gif|webp)$/i)
    const cloudPath = `photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext ? ext[1].toLowerCase() : 'jpg'}`
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: async (uploadRes) => {
        try {
          // 云存储 → 飞书附件（云函数下载后转传，返回 file_token + 24h 临时预览 URL）
          const r = await request('POST', '/borrow', {
            action: 'uploadPhoto',
            fileID: uploadRes.fileID
          })
          resolve({ token: r.fileToken, url: r.url })
        } catch (err) {
          reject(err)
        }
      },
      fail: (err) => {
        reject({ code: -1, message: '上传到云存储失败', detail: err })
      }
    })
  })
}

/**
 * 上传照片
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<{token: string, url: string}>}
 */
function uploadPhoto(filePath) {
  if (config.TRANSPORT === 'cloud') {
    return cloudUploadPhoto(filePath)
  }
  return uploadFile(filePath, 'photo').then((url) => ({
    token: url,
    url: resolveFileUrl(url)
  }))
}

module.exports = {
  uploadPhoto
}
