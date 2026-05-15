const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const UPLOAD_DIR = process.env.UPLOAD_DIR || './server/uploads'

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date()
    const dir = path.join(UPLOAD_DIR, String(now.getFullYear()), String(now.getMonth() + 1))
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, Date.now() + '-' + Math.random().toString(36).substr(2, 8) + ext)
  }
})

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

const router = express.Router()

router.post('/', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.json({ code: -1, message: '未选择文件' })
  }
  // 返回相对路径，实际使用需替换为域名
  const url = '/' + path.relative(path.resolve(UPLOAD_DIR, '..'), req.file.path).replace(/\\/g, '/')
  res.json({ code: 0, data: { url } })
})

module.exports = router
