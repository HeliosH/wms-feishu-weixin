const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { createFeishuClient, itemLogic } = require('./common')

let localConfig = { feishu: {} }
try { localConfig = require('./config.json') } catch (e) {
  try { localConfig = require('../feishuConfig.json') } catch (e2) {}
}
const KEY_MAP = {
  FEISHU_APP_ID: 'appId', FEISHU_APP_SECRET: 'appSecret', FEISHU_BITABLE_APP_TOKEN: 'bitableAppToken',
  FEISHU_TABLE_CATEGORIES: 'tableCategories', FEISHU_TABLE_ITEMS: 'tableItems',
  FEISHU_TABLE_INVENTORY_LOGS: 'tableInventoryLogs', FEISHU_TABLE_BORROW_RECORDS: 'tableBorrowRecords'
}
function getConfig(key) { return process.env[key] || localConfig.feishu[KEY_MAP[key]] || '' }

const cache = {
  async get(key) {
    const db = cloud.database()
    const res = await db.collection('system_cache').where({ key }).get()
    if (res.data && res.data.length > 0 && res.data[0].expire_at > Date.now() / 1000) {
      return res.data[0].token
    }
    return null
  },
  async set(key, token, expireAt) {
    const db = cloud.database()
    const res = await db.collection('system_cache').where({ key }).get()
    if (res.data && res.data.length > 0) {
      await db.collection('system_cache').doc(res.data[0]._id).update({ token, expire_at: expireAt })
    } else {
      await db.collection('system_cache').add({ data: { key, token, expire_at: expireAt } })
    }
  }
}

const client = createFeishuClient({
  appId: getConfig('FEISHU_APP_ID'),
  appSecret: getConfig('FEISHU_APP_SECRET'),
  bitableAppToken: getConfig('FEISHU_BITABLE_APP_TOKEN'),
  cache
})

const tableIds = {
  categories: getConfig('FEISHU_TABLE_CATEGORIES'),
  items: getConfig('FEISHU_TABLE_ITEMS'),
  inventoryLogs: getConfig('FEISHU_TABLE_INVENTORY_LOGS'),
  borrowRecords: getConfig('FEISHU_TABLE_BORROW_RECORDS')
}

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID
  const { action } = event
  try {
    let result
    switch (action) {
      case 'getCategoryList': result = await itemLogic.getCategoryList(client, tableIds); break
      case 'createCategory': result = await itemLogic.createCategory(client, tableIds, event); break
      case 'updateCategory': result = await itemLogic.updateCategory(client, tableIds, event.recordId, event); break
      case 'deleteCategory': result = await itemLogic.deleteCategory(client, tableIds, event.recordId); break
      case 'getItemList': result = await itemLogic.getItemList(client, tableIds, event); break
      case 'getItemDetail': result = await itemLogic.getItemDetail(client, tableIds, event.id); break
      case 'createItem': result = await itemLogic.createItem(client, tableIds, event); break
      case 'updateItem': result = await itemLogic.updateItem(client, tableIds, event.recordId, event); break
      case 'adjustInventory': result = await itemLogic.adjustInventory(client, tableIds, openid, event); break
      case 'getInventoryLogs': result = await itemLogic.getInventoryLogs(client, tableIds, event); break
      case 'getItemBorrowers': result = await itemLogic.getItemBorrowers(client, tableIds, event.itemId); break
      default: throw new Error(`未知操作: ${action}`)
    }
    return { code: 0, data: result }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}
