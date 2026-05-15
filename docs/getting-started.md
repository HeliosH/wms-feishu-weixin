# 上线部署指南

---

## 0. 前置准备

```bash
# 安装依赖（Node.js >= 16）
npm install
```

---

## 1. 微信小程序注册

1. 打开 [微信公众平台](https://mp.weixin.qq.com/) → 注册小程序（个人/企业）
2. 进入 **开发管理** → **开发设置** → 复制 **AppID**
3. 填入 [project.config.json](../project.config.json) 的 `appid` 字段

---

## 2. 开通云开发

1. 微信开发者工具打开项目
2. 顶部 **云开发** → 开通 → 创建环境（选按量付费或免费额度）
3. 环境 ID 填入 [project.config.json](../project.config.json) 的 `cloudfunctionRoot` 上方（或直接在 app.js 的 `wx.cloud.init` 中指定）

---

## 3. 创建云数据库集合

在云开发控制台 → 数据库 → 新建集合：
- `system_cache`（权限：所有用户可读，仅创建者可写）

---

## 4. 部署云函数

云函数的业务逻辑抽取到了 `cloudfunctions/common/` 公共模块中。
微信云开发中每个云函数是独立上传的，不能使用 `../common` 跨目录引用。
因此部署前必须将公共模块复制到各云函数目录内：

```bash
npm run predeploy
```

该命令会将 `cloudfunctions/common/` 复制到 5 个云函数各自的 `common/` 子目录。

然后在微信开发者工具中，对每个云函数目录右键 → **上传并部署**：

```
cloudfunctions/
├── feishuAuth       → 上传
├── feishuProxy      → 上传
├── userManage       → 上传
├── itemManage       → 上传
└── borrowManage     → 上传
```

部署后，在云开发控制台 → 云函数 → 逐个进入 → 添加环境变量（**生产环境**才需要，本地测试用 feishuConfig.json）：

| 变量名 | 值示例 |
|--------|--------|
| `FEISHU_APP_ID` | `cli_xxx` |
| `FEISHU_APP_SECRET` | `xxx` |
| `FEISHU_BITABLE_APP_TOKEN` | `bascnxxx` |
| `FEISHU_TABLE_USERS` | `tblxxx` |
| `FEISHU_TABLE_CATEGORIES` | `tblxxx` |
| `FEISHU_TABLE_ITEMS` | `tblxxx` |
| `FEISHU_TABLE_BORROW_RECORDS` | `tblxxx` |
| `FEISHU_TABLE_INVENTORY_LOGS` | `tblxxx` |

---

## 5. 首次运行

1. 微信开发者工具 → 编译
2. 手机扫码 → 微信一键登录
3. 首次登录的用户 `role: []`，`status: pending`，无任何权限

---

## 6. 创建第一个管理员

第一个管理员需要在飞书多维表格手动设置：

1. 打开飞书多维表格 → **users** 表
2. 找到刚登录的用户行
3. `role` 字段 → 勾选 `admin`
4. `status` 字段 → 改为 `active`

之后的管理员/仓库管理员可通过小程序内的「用户管理」页面分配。

---

## 7. 初始化货物类型

1. 管理员登录 → 首页「类型管理」
2. 创建货物类型（如"办公用品""电子产品"等）

---

## 8. 完整流程测试

### 货物入库
管理员 → 库存管理 → 新增货物 → 填写信息 → 保存

### 借用流程
```
借用人 → 货物详情 → 申请借用 → 填写数量+拍照 → 提交
管理员 → 借用审批 → 通过
借用人 → 到仓库领取
管理员 → 领取确认 → 确认
借用人 → 归还货物
管理员 → 归还确认 → 拍照 → 确认
```

### 补录流程
管理员 → 补录领取 → 选择货物、借用人、数量、日期、拍照 → 确认补录

### 权限申请
```
新用户登录 → 首页「申请借用权限」→ 填写姓名 → 提交
管理员 → 权限审批 → 通过
```

---

## 9. 常用命令

```bash
# 本地集成测试（覆盖所有业务逻辑，推荐）
npm test

# 本地测试飞书 API 连通性
npm run test:api

# 部署前复制公共模块到各云函数
npm run predeploy

# 提交并推送代码
git add -A && git commit -m "描述" && git push origin master
```

---

## 10. 常见问题

| 问题 | 解决 |
|------|------|
| 云函数报 `Cannot find module './common'` | 未执行 `npm run predeploy`，运行后再上传 |
| 飞书中文乱码 | 确认云函数已重新部署（charset=utf-8 修复） |
| 云函数报 1002 | Bitable 未授权 → 多维表格分享给应用 |
| 云函数报 403 | 应用无编辑权限 → 分享时选"可编辑" |
| 字段类型错误 | 关联字段改文本字段 |
| 登录后看不到任何功能 | 首次登录无角色，需先申请权限或管理员手动分配 |
| 本地测试报 `Cannot find module 'axios'` | 在项目根目录执行 `npm install` |
