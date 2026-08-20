// 显式加载 server/.env（不受启动时工作目录影响）
require('dotenv').config({ path: require('path').join(__dirname, '.env') })

const express = require('express')
const cors = require('cors')
const path = require('path')

const authMiddleware = require('./middleware/auth')
const authLoginRoute = require('./routes/auth-login')
const userRoutes = require('./routes/user')
const itemRoutes = require('./routes/item')
const borrowRoutes = require('./routes/borrow')
const feishuAuthRoutes = require('./routes/feishu-auth')
const feishuProxyRoutes = require('./routes/feishu-proxy')
const uploadRoutes = require('./routes/upload')

const app = express()

app.use(cors())
app.use(express.json())

// 静态文件：上传的照片
const UPLOAD_DIR = process.env.UPLOAD_DIR || './server/uploads'
app.use('/uploads', express.static(path.resolve(UPLOAD_DIR)))

// 公开路由（无需鉴权）
app.post('/api/auth/login', authLoginRoute)

// 鉴权中间件
app.use('/api', authMiddleware)

// 业务路由
app.use('/api/user', userRoutes)
app.use('/api/item', itemRoutes)
app.use('/api/borrow', borrowRoutes)
app.use('/api/feishu', feishuAuthRoutes)
app.use('/api/feishu/proxy', feishuProxyRoutes)
app.use('/api/upload', uploadRoutes)

const PORT = process.env.SERVER_PORT || 3000
app.listen(PORT, () => {
  console.log(`仓仓服务已启动: http://localhost:${PORT}`)
})
