/**
 * 文件上传服务
 */
const { uploadFile } = require('../utils/request')

/**
 * 上传照片
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<string>} 服务器返回的图片 URL
 */
function uploadPhoto(filePath) {
  return uploadFile(filePath, 'photo')
}

module.exports = {
  uploadPhoto
}
