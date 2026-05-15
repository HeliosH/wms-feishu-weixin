const express = require('express')
const router = express.Router()
const { feishuClient, tableIds } = require('../config')
const { borrowLogic } = require('../common')

router.post('/', async (req, res) => {
  const openid = req.openid
  const { action, ...params } = req.body
  try {
    let result
    switch (action) {
      case 'applyBorrow': result = await borrowLogic.applyBorrow(feishuClient, tableIds, openid, params); break
      case 'getBorrowList': result = await borrowLogic.getBorrowList(feishuClient, tableIds, params); break
      case 'approveBorrow': result = await borrowLogic.approveBorrow(feishuClient, tableIds, openid, params.id); break
      case 'rejectBorrow': result = await borrowLogic.rejectBorrow(feishuClient, tableIds, openid, params.id, params.reason); break
      case 'confirmCollect': result = await borrowLogic.confirmCollect(feishuClient, tableIds, openid, params.id); break
      case 'confirmReturn': result = await borrowLogic.confirmReturn(feishuClient, tableIds, openid, params.id, params.photoUrl); break
      case 'backfillBorrow': result = await borrowLogic.backfillBorrow(feishuClient, tableIds, openid, params); break
      default: throw new Error(`未知操作: ${action}`)
    }
    res.json({ code: 0, data: result })
  } catch (err) {
    res.json({ code: -1, message: err.message })
  }
})

module.exports = router
