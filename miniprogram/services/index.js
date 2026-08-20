/**
 * Services 统一出口
 * 页面中可直接 `const { itemService, borrowService } = require('../services/index')`
 */

const authService = require('./auth.service')
const userService = require('./user.service')
const itemService = require('./item.service')
const borrowService = require('./borrow.service')
const uploadService = require('./upload.service')

module.exports = {
  authService,
  userService,
  itemService,
  borrowService,
  uploadService
}
