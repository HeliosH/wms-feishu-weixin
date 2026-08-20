# ⚠️ 已废弃（Deprecated）

本目录为**旧版微信云函数架构**，已被 `server/` 目录下的自建 Express 服务完全取代。

## 当前架构

```
小程序 (miniprogram/) ──HTTP──> Express 服务 (server/) ──> 飞书多维表格 (Bitable)
```

## 为什么废弃

1. 云函数版使用 `wx-server-sdk` + 云数据库缓存飞书 token，运维复杂
2. 云函数版的 filter 语法（`=` 分隔）与 server 版（`&&` 拼接）不一致，易混淆
3. server 版新增了 `updateProfile` 等功能，云函数版未同步
4. 云函数按调用计费，自建服务成本更低、可控性更强

## 迁移说明

- 前端 API 调用已全部切换到 `miniprogram/utils/request.js` → `server/`
- 部署请参考 `docs/getting-started.md`
- 本目录仅作历史参考保留，**请勿在此基础上继续开发**

如确认不再需要，可安全删除本目录及根目录 `scripts/copy-common.js`。
