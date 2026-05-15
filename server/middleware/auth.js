const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET

function authMiddleware(req, res, next) {
  if (req.path === '/api/auth/login') return next()

  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.json({ code: -1, message: '未登录' })
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET)
    req.openid = payload.openid
    next()
  } catch (err) {
    return res.json({ code: -1, message: '登录已过期，请重新登录' })
  }
}

module.exports = authMiddleware
