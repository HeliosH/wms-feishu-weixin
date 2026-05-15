require('dotenv').config()

const cache = require('./cache')
const { createFeishuClient } = require('./common')

const feishuClient = createFeishuClient({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  bitableAppToken: process.env.FEISHU_BITABLE_APP_TOKEN,
  cache
})

const tableIds = {
  users: process.env.FEISHU_TABLE_USERS,
  categories: process.env.FEISHU_TABLE_CATEGORIES,
  items: process.env.FEISHU_TABLE_ITEMS,
  borrowRecords: process.env.FEISHU_TABLE_BORROW_RECORDS,
  inventoryLogs: process.env.FEISHU_TABLE_INVENTORY_LOGS
}

module.exports = { feishuClient, tableIds }
