const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { createFeishuClient, userLogic } = require('./common')

let localConfig = { feishu: {} }
try { localConfig = require('./config.json') } catch (e) {
  try { localConfig = require('../feishuConfig.json') } catch (e2) {}
}
const KEY_MAP = {
  FEISHU_APP_ID: 'appId', FEISHU_APP_SECRET: 'appSecret', FEISHU_BITABLE_APP_TOKEN: 'bitableAppToken',
  FEISHU_TABLE_USERS: 'tableUsers'
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
  users: getConfig('FEISHU_TABLE_USERS')
}

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID
  const { action } = event
  try {
    let result
    switch (action) {
      case 'login': result = await userLogic.login(client, tableIds, openid); break
      case 'getUserList': result = await userLogic.getUserList(client, tableIds); break
      case 'updateUserRole': result = await userLogic.updateUserRole(client, tableIds, event.openid, event.role); break
      case 'toggleUserStatus': result = await userLogic.toggleUserStatus(client, tableIds, event.openid, event.status); break
      case 'applyRole': result = await userLogic.applyRole(client, tableIds, openid, event.name); break
      case 'approveRole': result = await userLogic.approveRole(client, tableIds, event.openid, event.approved, event.role); break
      default: throw new Error(`未知操作: ${action}`)
    }
    return { code: 0, data: result }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}
