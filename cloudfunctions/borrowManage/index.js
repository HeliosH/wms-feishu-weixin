const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { createFeishuClient, borrowLogic } = require('./common')

let localConfig = { feishu: {} }
try { localConfig = require('./config.json') } catch (e) {
  try { localConfig = require('../feishuConfig.json') } catch (e2) {}
}
const KEY_MAP = {
  FEISHU_APP_ID: 'appId', FEISHU_APP_SECRET: 'appSecret', FEISHU_BITABLE_APP_TOKEN: 'bitableAppToken',
  FEISHU_TABLE_BORROW_RECORDS: 'tableBorrowRecords', FEISHU_TABLE_ITEMS: 'tableItems',
  FEISHU_TABLE_INVENTORY_LOGS: 'tableInventoryLogs', FEISHU_TABLE_USERS: 'tableUsers'
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
  borrowRecords: getConfig('FEISHU_TABLE_BORROW_RECORDS'),
  items: getConfig('FEISHU_TABLE_ITEMS'),
  inventoryLogs: getConfig('FEISHU_TABLE_INVENTORY_LOGS'),
  users: getConfig('FEISHU_TABLE_USERS')
}

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID
  const { action } = event
  try {
    let result
    switch (action) {
      case 'applyBorrow': result = await borrowLogic.applyBorrow(client, tableIds, openid, event); break
      case 'getBorrowList': result = await borrowLogic.getBorrowList(client, tableIds, event); break
      case 'approveBorrow': result = await borrowLogic.approveBorrow(client, tableIds, openid, event.id); break
      case 'rejectBorrow': result = await borrowLogic.rejectBorrow(client, tableIds, openid, event.id, event.reason); break
      case 'confirmCollect': result = await borrowLogic.confirmCollect(client, tableIds, openid, event.id); break
      case 'confirmReturn': result = await borrowLogic.confirmReturn(client, tableIds, openid, event.id, event.photoUrl); break
      case 'backfillBorrow': result = await borrowLogic.backfillBorrow(client, tableIds, openid, event); break
      case 'uploadPhoto': {
        // 云存储文件 → 飞书附件（file_token + 24h 临时预览 URL）
        if (!event.fileID) throw new Error('缺少 fileID')
        const dl = await cloud.downloadFile({ fileID: event.fileID })
        const fileToken = await client.uploadMedia(
          dl.fileContent,
          event.fileName || `photo_${Date.now()}.jpg`
        )
        const urlMap = await client.getTmpDownloadUrls([fileToken])
        result = { fileToken, url: urlMap.get(fileToken) || '' }
        break
      }
      default: throw new Error(`未知操作: ${action}`)
    }
    return { code: 0, data: result }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}
