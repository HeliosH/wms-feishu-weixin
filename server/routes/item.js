const express = require('express')
const router = express.Router()
const { feishuClient, tableIds } = require('../config')
const { itemLogic } = require('../common')

router.post('/', async (req, res) => {
  const openid = req.openid
  const { action, ...params } = req.body
  try {
    let result
    switch (action) {
      case 'getCategoryList': result = await itemLogic.getCategoryList(feishuClient, tableIds); break
      case 'createCategory': result = await itemLogic.createCategory(feishuClient, tableIds, params); break
      case 'updateCategory': result = await itemLogic.updateCategory(feishuClient, tableIds, params.recordId, params); break
      case 'deleteCategory': result = await itemLogic.deleteCategory(feishuClient, tableIds, params.recordId); break
      case 'getItemList': result = await itemLogic.getItemList(feishuClient, tableIds, params); break
      case 'getItemDetail': result = await itemLogic.getItemDetail(feishuClient, tableIds, params.id); break
      case 'createItem': result = await itemLogic.createItem(feishuClient, tableIds, params); break
      case 'updateItem': result = await itemLogic.updateItem(feishuClient, tableIds, params.recordId, params); break
      case 'adjustInventory': result = await itemLogic.adjustInventory(feishuClient, tableIds, openid, params); break
      case 'getInventoryLogs': result = await itemLogic.getInventoryLogs(feishuClient, tableIds, params); break
      case 'getItemBorrowers': result = await itemLogic.getItemBorrowers(feishuClient, tableIds, params.itemId); break
      default: throw new Error(`未知操作: ${action}`)
    }
    res.json({ code: 0, data: result })
  } catch (err) {
    res.json({ code: -1, message: err.message })
  }
})

module.exports = router
