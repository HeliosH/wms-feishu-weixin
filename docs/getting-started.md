# 仓仓 — 部署运行指南

---

## 0. 架构概览

```
微信小程序 ──wx.request()──> 自建 Express 服务器 ──> 飞书多维表格（数据库）
            wx.uploadFile()       │
                                  ├─ JWT 鉴权（wx.login → code2session → openid）
                                  ├─ 内存缓存（飞书 token）
                                  └─ server/common/ 业务逻辑
```

- **不再依赖微信云开发**（云函数、云数据库、云存储），零费用
- **后端**：Node.js Express 服务，部署在自有云服务器
- **数据库**：飞书多维表格（免费）
- **文件存储**：服务器本地磁盘

---

## 1. 前置准备

### 1.1 硬件要求

| 项目 | 最低配置 |
|------|---------|
| 云服务器 | 1 核 1G，Linux（Ubuntu 20.04+ / CentOS 7+）|
| Node.js | >= 18.x |
| 域名 | 一个已备案域名（微信小程序要求 HTTPS） |

### 1.2 第三方账号

| 平台 | 用途 | 需要什么 |
|------|------|---------|
| 微信公众平台 | 小程序运行 | AppID、AppSecret |
| 飞书开放平台 | 多维表格 API | 应用 App ID、App Secret |
| 飞书多维表格 | 数据库 | 5 张表及表 ID |

---

## 2. 飞书多维表格初始化

### 2.1 创建飞书应用

1. 打开 [飞书开放平台](https://open.feishu.cn/) → 创建企业自建应用
2. 应用功能 → 添加「多维表格」权限
3. **权限管理** → 开启以下权限：
   - `bitable:app` — 查看、评论、编辑和管理多维表格
4. 发布版本 → 创建版本 → 发布（管理员审核通过）
5. **凭证与基础信息** → 复制 `App ID` 和 `App Secret`

### 2.2 创建多维表格

1. 飞书 → 新建多维表格 → 命名为「仓仓」
2. 将表格**分享**给刚创建的应用（右上角分享 → 添加应用 → 选择你的应用 → 权限设为「可编辑」）
3. 复制多维表格 URL 中 `base/` 后面的 `appToken`（如 `GyNrbBlEDaTGmYscllXcb2Eqnde`）

### 2.3 创建 5 张表

按以下结构创建数据表（详细字段定义见 [feishu-tables.md](feishu-tables.md)）：

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `users` | 用户表 | openid, name, role(多选), status(单选) |
| `categories` | 货物类型表 | name, description |
| `items` | 货物/库存表 | name, total/available/borrowed_quantity, status |
| `borrow_records` | 借用记录表 | item_id, borrower_id, quantity, status(单选) |
| `inventory_logs` | 库存变更日志 | item_id, change_type(单选), quantity |

每张表建完后，从 URL 复制其 `tblXXXX` ID。

---

## 3. 服务端配置

### 3.1 项目结构

```
server/
  app.js              # Express 入口
  config.js           # 环境变量加载 + 飞书客户端初始化
  cache.js            # 内存缓存（飞书 token）
  middleware/auth.js   # JWT 鉴权中间件
  routes/
    auth-login.js     # 登录接口（wx.login → JWT）
    user.js           # 用户管理
    item.js           # 货物/库存/分类管理
    borrow.js         # 借用管理
    feishu-auth.js    # 飞书 token 获取
    feishu-proxy.js   # 飞书表格 CRUD 代理
    upload.js         # 照片上传
  common/             # 业务逻辑（从 cloudfunctions/common/ 复制）
  uploads/            # 照片存储目录
  .env                # 环境变量（敏感信息）
  .env.example        # 环境变量模板
```

### 3.2 安装依赖

```bash
cd server
npm install
```

### 3.3 配置环境变量

复制模板并填入真实值：

```bash
cp .env.example .env
```

编辑 `server/.env`：

```env
# Server
SERVER_PORT=3000
JWT_SECRET=生成一个随机字符串（如 openssl rand -hex 32 的结果）

# WeChat Mini Program（微信公众平台 → 开发管理 → 开发设置）
WX_APPID=wx0c2fefb3db349ae2
WX_APPSECRET=你的微信小程序AppSecret

# Feishu（飞书开放平台 → 应用 → 凭证与基础信息）
FEISHU_APP_ID=cli_aa89550f43b95cb5
FEISHU_APP_SECRET=你的飞书AppSecret
FEISHU_BITABLE_APP_TOKEN=GyNrbBlEDaTGmYscllXcb2Eqnde

# Feishu Table IDs（每张表的 tblXXXX）
FEISHU_TABLE_USERS=tblyLk5AUN2x8SVw
FEISHU_TABLE_CATEGORIES=tblpSr7YIck02h65
FEISHU_TABLE_ITEMS=tbloH7Tlfqbnr0Zw
FEISHU_TABLE_BORROW_RECORDS=tblzEKDMBmg3visJ
FEISHU_TABLE_INVENTORY_LOGS=tblfMPghSJIsL3gF

# Upload
UPLOAD_DIR=./server/uploads
```

> **注意**：`WX_APPSECRET` 和 `FEISHU_APP_SECRET` 是核心敏感信息，**绝对不能提交到 git**。`.env` 已在 `.gitignore` 中排除。

### 3.4 本地验证

```bash
cd server
node app.js
# 输出：仓仓服务已启动: http://localhost:3000
```

测试接口：

```bash
# 1. 测试飞书连通性（需要先生成 JWT，见下方说明）
curl -H "Authorization: Bearer <JWT_TOKEN>" http://localhost:3000/api/feishu/token

# 2. 测试用户列表
curl -X POST http://localhost:3000/api/user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{"action":"getUserList"}'
```

快速生成测试 JWT（在 server 目录下执行）：

```bash
node -e "require('dotenv').config();const j=require('jsonwebtoken');console.log(j.sign({openid:'test'},process.env.JWT_SECRET,{expiresIn:'7d'}))"
```

---

## 4. 小程序端配置

### 4.1 配置服务器地址

编辑 `miniprogram/utils/api.js` 第 4 行：

```js
// 开发环境（本地测试）
const BASE_URL = 'http://localhost:3000/api'

// 生产环境（替换为你的真实域名）
// const BASE_URL = 'https://your-domain.com/api'
```

### 4.2 开发环境设置

`project.config.json` 中的 `urlCheck` 已设为 `false`，允许开发阶段使用 localhost。

### 4.3 微信开发者工具

1. 打开项目 → 如果提示云开发相关错误，忽略（已移除云开发依赖）
2. 编译 → 扫码登录测试

---

## 5. 云服务器部署

### 5.1 上传代码

```bash
# 在云服务器上
git clone <你的仓库地址>
cd wms-feishu-weixin/server
npm install
cp .env.example .env
# 编辑 .env 填入真实凭证
```

### 5.2 配置 Nginx + HTTPS

微信小程序要求所有 `wx.request` 和 `wx.uploadFile` 请求必须走 HTTPS。

```bash
# 安装 nginx 和 certbot
sudo apt install nginx certbot python3-certbot-nginx -y

# 获取 SSL 证书
sudo certbot --nginx -d your-domain.com
```

Nginx 配置（`/etc/nginx/sites-available/wms`）：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 照片静态文件（如需要外部访问）
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/wms /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5.3 使用 PM2 守护进程

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
cd /path/to/wms-feishu-weixin/server
pm2 start app.js --name wms-server --env production

# 开机自启
pm2 save
pm2 startup
```

PM2 常用命令：

```bash
pm2 status          # 查看状态
pm2 logs wms-server # 查看日志
pm2 restart wms-server  # 重启
pm2 stop wms-server     # 停止
```

### 5.4 微信公众平台配置

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. **开发** → **开发管理** → **开发设置**
3. **服务器域名** → 添加：
   - `request合法域名`：`https://your-domain.com`
   - `uploadFile合法域名`：`https://your-domain.com`
4. 保存后生效（无需审核）

---

## 6. 创建第一个管理员

1. 手机扫码进入小程序 → 微信一键登录（此时无任何权限，首页提示申请权限）
2. 打开飞书多维表格 → `users` 表
3. 找到刚登录的那条记录（按 `openid` 匹配）
4. 手动编辑：
   - `role` → 勾选 `admin`
   - `status` → 改为 `active`
5. 小程序退出重新登录，即可看到完整管理菜单

---

## 7. 初始化货物类型

管理员登录小程序后：

1. 首页 → **类型管理** → 新增类型
2. 创建如「办公用品」「电子产品」「工具设备」等类型

---

## 8. 完整流程测试

### 8.1 货物入库

管理员 → 库存管理 → 新增货物 → 填写名称/类型/数量 → 保存

### 8.2 借用流程

```
借用人  → 货物列表 → 货物详情 → 申请借用 → 填写数量 + 拍照 → 提交
管理员  → 借用审批 → 通过
借用人  → 到仓库领取货物
管理员  → 领取确认 → 确认已领取
借用人  → 归还货物
管理员  → 归还确认 → 拍照留档 → 确认已归还
```

### 8.3 补录流程

管理员 → 补录领取 → 选择货物、借用人、数量、日期、拍照 → 确认补录

### 8.4 权限申请

```
新用户  → 登录 → 首页「申请借用权限」→ 填写姓名 → 提交
管理员  → 权限审批 → 通过（可选角色：借用人员、仓库管理员）
```

### 8.5 异常流程测试

| 场景 | 预期结果 |
|------|---------|
| 库存不足时申请借用 | 提示「库存不足」 |
| 重复审批同一申请 | 提示「不在待审批状态」 |
| 禁用管理员账号 | 提示「管理员账号不可禁用」 |
| 移除管理员角色 | 提示「管理员角色不可移除」 |
| JWT 过期后请求 | 提示「登录已过期，请重新登录」 |

---

## 9. 常用命令

```bash
# === 本地开发 ===

# 启动后端服务
cd server && node app.js

# 监听模式（文件变更自动重启，Node >= 18）
cd server && node --watch app.js

# 本地集成测试（覆盖所有业务逻辑）
cd server && node -e "require('dotenv').config()" && cd .. && node test/local-test.js

# === 部署相关 ===

# 安装依赖
cd server && npm install

# 启动（PM2）
pm2 start server/app.js --name wms-server

# 重启
pm2 restart wms-server

# 查看日志
pm2 logs wms-server --lines 50

# Nginx 重载
sudo systemctl reload nginx

# SSL 证书续期
sudo certbot renew --dry-run

# === Git ===

git add -A && git commit -m "描述" && git push origin master
```

---

## 10. 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 服务启动报错 `Cannot find module './common'` | 未复制 common 模块 | `cp -r cloudfunctions/common/ server/common/` |
| 小程序请求报 "不在以下 request 合法域名" | 微信公众平台未配置域名 | 添加域名到白名单（见 5.4），或开发期设 `urlCheck: false` |
| 飞书 API 返回 1002 | 多维表格未授权给应用 | 飞书多维表格 → 分享 → 添加应用 → 设为「可编辑」 |
| 飞书 API 返回 403 | 应用无编辑权限 | 同上，确认权限不是「只读」 |
| 飞书 API 返回中文乱码 | Content-Type 缺少 charset | `feishu-client.js` 已加固，重新部署 server 即可 |
| 登录后看到空白框/无功能菜单 | 新用户无角色 | 按第 6 节手动设置管理员，或走权限申请流程 |
| 小程序连接服务器超时 | 服务器防火墙未开放端口 | `sudo ufw allow 443/tcp`（HTTPS）/ `sudo ufw allow 3000/tcp`（仅开发） |
| 上传失败 "未选择文件" | 上传字段名不匹配 | `wx.uploadFile` 的 `name` 参数必须为 `'photo'`（与 multer 配置一致） |
| 照片不显示 | URL 路径不完整 | 返回的是相对路径，前端需拼接服务器域名；或服务器返回完整 URL |
| JWT 过期频繁 | 默认 7 天有效期太短 | 修改 `server/routes/auth-login.js` 中 `expiresIn` 值 |
| 云函数相关报错 | 已废弃云开发 | 忽略，确认 `app.js` 中无 `wx.cloud.init`、`app.json` 中无 `"cloud": true` |
