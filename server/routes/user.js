const express = require('express')
const router = express.Router()
const { feishuClient, tableIds } = require('../config')
const { userLogic } = require('../common')

router.post('/', async (req, res) => {
  const openid = req.openid
  const { action, ...params } = req.body
  try {
    let result
    switch (action) {
      case 'login': result = await userLogic.login(feishuClient, tableIds, openid); break
      case 'getUserList': result = await userLogic.getUserList(feishuClient, tableIds); break
      case 'updateUserRole': result = await userLogic.updateUserRole(feishuClient, tableIds, params.openid, params.role); break
      case 'toggleUserStatus': result = await userLogic.toggleUserStatus(feishuClient, tableIds, params.openid, params.status); break
      case 'applyRole': result = await userLogic.applyRole(feishuClient, tableIds, openid, params.name); break
      case 'approveRole': result = await userLogic.approveRole(feishuClient, tableIds, params.openid, params.approved, params.role); break
      default: throw new Error(`未知操作: ${action}`)
    }
    res.json({ code: 0, data: result })
  } catch (err) {
    res.json({ code: -1, message: err.message })
  }
})

module.exports = router
