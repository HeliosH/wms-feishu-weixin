# 云函数架构（当前生产方案）

本目录为**微信云函数架构**，是小程序的正式服务端方案（生产环境通过 `wx.cloud.callFunction` 调用，免服务器/域名/备案）。

## 架构

```
小程序 ──callFunction──> 云函数 ──API──> 飞书多维表格（数据 + 照片附件）
```

- 业务逻辑与 `server/` 共享同一份代码：`server/common/` 为唯一源，运行 `node scripts/copy-common.js` 同步到本目录及各云函数
- 鉴权：`cloud.getWXContext().OPENID` 免鉴权获取用户身份（无需 JWT）
- 照片：上传走云存储中转 → 飞书附件字段（file_token），展示时批量换 24h 临时 URL
- token 缓存：云数据库 `system_cache` 集合（首次部署需手动创建该集合）

## 云函数清单

| 函数 | 职责 |
|---|---|
| `userManage` | 用户：login / getUserList / updateUserRole / toggleUserStatus / applyRole / approveRole / updateProfile / uploadPhoto |
| `itemManage` | 分类与货物：getCategoryList / createCategory / updateCategory / deleteCategory / getItemList / getItemDetail / createItem / updateItem / adjustInventory / getInventoryLogs / getItemBorrowers |
| `borrowManage` | 借用：applyBorrow / getBorrowList / approveBorrow / rejectBorrow / confirmCollect / confirmReturn / backfillBorrow / uploadPhoto |
| `feishuProxy` | 通用 Bitable CRUD（遗留，暂未使用） |
| `feishuAuth` | 飞书 token 获取（遗留，暂未使用） |

## 配置

优先级：云函数环境变量 > `cloudfunctions/feishuConfig.json`（该文件含真实凭证，已 gitignore）。
环境变量键名与 `server/.env` 一致（FEISHU_APP_ID 等），推荐在云开发控制台为每个函数配置。

## 部署步骤

1. `node scripts/copy-common.js`（同步公共逻辑）
2. `node scripts/setup-feishu-attachment-fields.js`（首次：在多维表格创建附件字段）
3. 开发者工具中右键每个云函数 → 上传并部署（云端安装依赖）
4. 详见 `docs/deploy-cloud.md`

## 与 server/（本地开发）的关系

`server/` 目录保留用于本地开发与自动化测试（mock E2E / 真实飞书 E2E）。
小程序端通过 `miniprogram/utils/config.js` 的 `TRANSPORT` 开关选择：
develop 默认走 HTTP（localhost），trial/release 走云函数。
