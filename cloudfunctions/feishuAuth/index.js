const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { createFeishuClient } = require('./common')

let localConfig = { feishu: {} }
try { localConfig = require('./config.json') } catch (e) {
  try { localConfig = require('../feishuConfig.json') } catch (e2) {}
}
const KEY_MAP = {
  FEISHU_APP_ID: 'appId', FEISHU_APP_SECRET: 'appSecret'
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
  bitableAppToken: '', // auth 不需要 bitable token
  cache
})

exports.main = async (event) => {
  try {
    const token = await client.getToken()
    return { code: 0, data: { token } }
  } catch (err) {
    return { code: -1, message: err.message }
  }
}
