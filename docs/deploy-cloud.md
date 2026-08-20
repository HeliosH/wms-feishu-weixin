# 云函数部署指引（生产架构）

当前生产架构为 **微信云函数 + 飞书多维表格**，免服务器、免域名备案、免 HTTPS 证书：

```
小程序 (wx.cloud.callFunction)
   │
   ├── userManage    用户管理（登录/角色审批/头像）
   ├── itemManage    货物/分类/库存
   ├── borrowManage  借用全流程 + 照片上传
   ├── feishuProxy   飞书代理（预留）
   └── feishuAuth    飞书授权（预留）
          │
          ▼ HTTPS（云函数出方向，无需小程序域名白名单）
   飞书开放平台 (open.feishu.cn)
   ├── 多维表格 Bitable  业务数据
   └── Drive Medias      照片附件（file_token + 24h 临时 URL）
```

鉴权：云函数内 `cloud.getWXContext().OPENID` 直接获得用户身份，**无需 JWT/登录态维护**。

## 0. 前置条件

| 项目 | 说明 |
|---|---|
| 微信小程序 AppID | 已注册，开发者工具已登录 |
| 云开发环境 | 微信开发者工具 → 云开发 → 开通。**注意计费**：免费体验版（3000 点/月）在小程序上线后第 15 天到期，正式使用需基础版（19.9 元/月起） |
| 飞书自建应用 | 已开通 Bitable 读写、Drive 素材上传权限（见 `docs/feishu-tables.md`） |
| server/.env | 已配置真实飞书凭证（APP_ID/APP_SECRET/BITABLE_APP_TOKEN/各表 ID） |

## 1. 初始化飞书附件字段（幂等，已完成一次即可）

照片存为飞书附件字段（type 17），需在多维表格中预先创建：

```bash
npm run cloud:setup-fields
```

创建的字段：
- `borrow_records` 表：`apply_photo_file` / `collect_photo_file` / `return_photo_file`
- `users` 表：`avatar_file`

> 飞书不支持修改字段类型，故新增 `*_file` 附件字段，旧文本字段保留兜底。
> 未创建附件字段时写入会报 `FieldNameNotFound`。

## 2. 同步公共代码到各云函数

`server/common/` 是唯一逻辑源，云函数无法相对引用上级目录，需分发：

```bash
npm run cloud:sync
```

> 任何 `server/common/*` 修改后、上传云函数前都必须重新执行。

## 3. 配置云函数的飞书凭证

两种方式（环境变量优先）：

**方式 A（推荐）：云开发控制台配置环境变量**
云开发控制台 → 云函数 → 选中函数 → 配置 → 环境变量：

```
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_BITABLE_APP_TOKEN=xxx
FEISHU_TABLE_USERS=tblxxx
FEISHU_TABLE_CATEGORIES=tblxxx
FEISHU_TABLE_ITEMS=tblxxx
FEISHU_TABLE_BORROW_RECORDS=tblxxx
FEISHU_TABLE_INVENTORY_LOGS=tblxxx
```

**方式 B：config.json**
在每个云函数目录放置 `config.json`（不会提交 git）：

```json
{
  "feishu": {
    "appId": "cli_xxx",
    "appSecret": "xxx",
    "bitableAppToken": "xxx",
    "tableUsers": "tblxxx",
    "tableCategories": "tblxxx",
    "tableItems": "tblxxx",
    "tableBorrowRecords": "tblxxx",
    "tableInventoryLogs": "tblxxx"
  }
}
```

> 五个函数（userManage/itemManage/borrowManage/feishuProxy/feishuAuth）需保持一致。

## 4. 上传云函数

微信开发者工具中，对 `cloudfunctions/` 下每个函数目录**右键 → 上传并部署：云端安装依赖**（cloudfunctions 依赖 axios，必须选"云端安装依赖"）。

依赖 `wx-server-sdk` 的函数首次上传同理。

## 5. 小程序侧配置云环境 ID

编辑 `miniprogram/utils/config.js`：

```js
const CLOUD_ENV = '你的环境ID'   // 云开发控制台右上角可见，形如 cloud1-xxx
```

传输模式自动按版本切换（`miniprogram/utils/config.js`）：

| 版本 | TRANSPORT | 说明 |
|---|---|---|
| develop（开发版） | `http` | 直连本地 Express server（本地调试用） |
| trial（体验版） | `cloud` | 走云函数 |
| release（正式版） | `cloud` | 走云函数 |

> 本地调试云函数链路：开发者工具 → 详情 → 本地设置 → 勾选"将 app.json 中 cloudfunctionRoot 指定的本地云函数"。

## 6. 验证清单

1. 开发者工具编译预览（develop 版走 http 模式验证 UI 不受影响）
2. **上传为体验版**（trial 版走 cloud 模式）：
   - 登录（新用户自动注册 pending）
   - 管理员授权后借用申请 → 审批 → 领取 → 归还全流程
   - 申请/归还照片上传 → 飞书表格附件字段出现图片缩略图 → 列表页图片正常显示（临时 URL）
   - 头像上传与显示
3. 真机预览（iOS/Android 各一台）

## 7. 常见问题

| 现象 | 原因与处理 |
|---|---|
| `cloud function not found` | 函数未上传，或 `CLOUD_ENV` 未配置/环境 ID 错误 |
| 写照片报 `FieldNameNotFound` | 未运行 `npm run cloud:setup-fields` 创建附件字段 |
| 图片隔天裂图 | 临时 URL 24h 过期属正常（每次读取实时换取，进程内缓存 23h），刷新列表即可 |
| 图片偶发加载慢 | 飞书临时 URL 接口频控 5 QPS、单次 5 个 token，批量读取已分块+缓存 |
| 云函数超时 | 默认 3s，照片上传链路建议在控制台调至 10s+ |
| 本地改了 server/common 没生效 | 忘了 `npm run cloud:sync` |

## 8. 本地测试（部署前回归）

```bash
npm run test:e2e    # mock 飞书 + Express server，55 用例
npm run test:cloud  # mock wx-server-sdk + mock 飞书直调云函数入口，15 用例（自动先 cloud:sync）
npm run test:fe     # 前端逻辑，32 用例
npm run test:real   # 真实飞书 E2E（服务端链路）
```
