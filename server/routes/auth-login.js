const axios = require('axios')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET
const WX_APPID = process.env.WX_APPID
const WX_APPSECRET = process.env.WX_APPSECRET

module.exports = async function authLogin(req, res) {
  const { code } = req.body
  if (!code) {
    return res.json({ code: -1, message: '缺少登录凭证' })
  }

  // 开发/E2E 旁路：设置 DEV_OPENID 后跳过微信 jscode2session，
  // 所有登录都返回固定 openid（供 UI 自动化测试使用，生产环境切勿配置）
  if (process.env.DEV_OPENID) {
    const openid = process.env.DEV_OPENID
    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' })
    return res.json({ code: 0, data: { token, openid, expiresIn: 7 * 24 * 3600 } })
  }

  try {
    const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: WX_APPID,
        secret: WX_APPSECRET,
        js_code: code,
        grant_type: 'authorization_code'
      }
    })

    if (wxRes.data.errcode) {
      return res.json({ code: -1, message: `微信登录失败: ${wxRes.data.errmsg}` })
    }

    const { openid, session_key } = wxRes.data
    const token = jwt.sign({ openid }, JWT_SECRET, { expiresIn: '7d' })

    res.json({ code: 0, data: { token, openid, expiresIn: 7 * 24 * 3600 } })
  } catch (err) {
    res.json({ code: -1, message: err.message })
  }
}
