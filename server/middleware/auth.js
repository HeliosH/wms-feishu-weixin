const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET

function authMiddleware(req, res, next) {
  if (req.path === '/api/auth/login') return next()

  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    // HTTP 401 是前端 request.js 静默刷新 token 的触发契约，勿改为 200
    return res.status(401).json({ code: -1, message: '未登录' })
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET)
    req.openid = payload.openid
    next()
  } catch (err) {
    return res.status(401).json({ code: -1, message: '登录已过期，请重新登录' })
  }
}

module.exports = authMiddleware
