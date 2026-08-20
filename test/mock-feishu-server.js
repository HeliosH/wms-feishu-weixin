/**
 * Mock 飞书服务器 — 内存版 Bitable
 *
 * 实现本项目 server/common/* 实际调用的飞书 API 子集：
 *   POST /open-apis/auth/v3/tenant_access_token/internal   获取 tenant_access_token
 *   GET  /open-apis/bitable/v1/apps/:appToken/tables/:tableId/records          列表(支持 filter/page_size)
 *   GET  /open-apis/bitable/v1/apps/:appToken/tables/:tableId/records/:id      详情
 *   POST /open-apis/bitable/v1/apps/:appToken/tables/:tableId/records          创建
 *   PUT  /open-apis/bitable/v1/apps/:appToken/tables/:tableId/records/:id      更新
 *   DELETE /open-apis/bitable/v1/apps/:appToken/tables/:tableId/records/:id    删除
 *
 * filter 语法（与项目一致）：CurrentValue.[field]="value" && CurrentValue.[field2]="value2"
 *
 * 用法: const server = createMockFeishuServer(); await server.start(9999); ... await server.stop()
 *       server.tables   — 内存表数据 { [tableId]: [ { record_id, fields } ] }
 *       server.reset()  — 清空所有表数据
 */
const express = require('express')

function createMockFeishuServer() {
  const app = express()
  app.use(express.json())

  const TOKEN = 'mock-tenant-token-e2e'
  const tables = {} // { tableId: [ { record_id, fields } ] }
  let idSeq = 0

  function getTable(tableId) {
    if (!tables[tableId]) tables[tableId] = []
    return tables[tableId]
  }

  function nextId() {
    idSeq++
    return `rec_mock_${String(idSeq).padStart(6, '0')}`
  }

  // ---- filter 解析: CurrentValue.[field]="value" && CurrentValue.[f2]="v2" ----
  function parseFilter(filter) {
    if (!filter) return []
    return filter.split('&&').map(part => {
      const m = part.trim().match(/^CurrentValue\.\[(.+?)\]="(.*)"$/)
      if (!m) throw new Error(`mock: 无法解析 filter: ${part}`)
      return { field: m[1], value: m[2] }
    })
  }

  function matchFilters(record, filter) {
    const conditions = parseFilter(filter)
    return conditions.every(({ field, value }) => String(record.fields[field]) === value)
  }

  // ---- 鉴权 ----
  app.use('/open-apis/bitable', (req, res, next) => {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${TOKEN}`) {
      return res.json({ code: 99991663, msg: 'mock: invalid tenant_access_token' })
    }
    next()
  })

  // ---- tenant_access_token ----
  app.post('/open-apis/auth/v3/tenant_access_token/internal', (req, res) => {
    const { app_id, app_secret } = req.body || {}
    if (!app_id || !app_secret || app_secret === 'invalid') {
      return res.json({ code: 10003, msg: 'mock: invalid app_id/app_secret' })
    }
    res.json({ code: 0, tenant_access_token: TOKEN, expire: 7200 })
  })

  // ---- 记录 CRUD ----
  const recordPath = '/open-apis/bitable/v1/apps/:appToken/tables/:tableId/records'

  // 列表
  app.get(recordPath, (req, res) => {
    const table = getTable(req.params.tableId)
    let items = table
    try {
      if (req.query.filter) items = items.filter(r => matchFilters(r, req.query.filter))
    } catch (e) {
      return res.json({ code: 400, msg: e.message })
    }
    const pageSize = Number(req.query.page_size || 20)
    const itemsPage = items.slice(0, pageSize)
    res.json({
      code: 0,
      data: { items: itemsPage, has_more: items.length > pageSize, page_token: '', total: items.length }
    })
  })

  // 详情
  app.get(`${recordPath}/:recordId`, (req, res) => {
    const table = getTable(req.params.tableId)
    const record = table.find(r => r.record_id === req.params.recordId)
    if (!record) return res.json({ code: 1254044, msg: 'mock: record not found' })
    res.json({ code: 0, data: { record } })
  })

  // 创建
  app.post(recordPath, (req, res) => {
    const table = getTable(req.params.tableId)
    const record = { record_id: nextId(), fields: { ...(req.body.fields || {}) } }
    table.push(record)
    res.json({ code: 0, data: { record } })
  })

  // 更新（部分字段合并，与飞书行为一致）
  app.put(`${recordPath}/:recordId`, (req, res) => {
    const table = getTable(req.params.tableId)
    const record = table.find(r => r.record_id === req.params.recordId)
    if (!record) return res.json({ code: 1254044, msg: 'mock: record not found' })
    Object.assign(record.fields, req.body.fields || {})
    res.json({ code: 0, data: { record } })
  })

  // 删除
  app.delete(`${recordPath}/:recordId`, (req, res) => {
    const table = getTable(req.params.tableId)
    const idx = table.findIndex(r => r.record_id === req.params.recordId)
    if (idx === -1) return res.json({ code: 1254044, msg: 'mock: record not found' })
    table.splice(idx, 1)
    res.json({ code: 0, data: {} })
  })

  let httpServer = null

  return {
    tables,
    reset() {
      Object.keys(tables).forEach(k => delete tables[k])
    },
    start(port) {
      return new Promise((resolve) => {
        httpServer = app.listen(port, () => resolve(port))
      })
    },
    stop() {
      return new Promise((resolve) => {
        if (httpServer) httpServer.close(() => resolve())
        else resolve()
      })
    }
  }
}

module.exports = { createMockFeishuServer }

// 直接运行时独立启动（调试用）
if (require.main === module) {
  const port = Number(process.argv[2] || 9099)
  createMockFeishuServer().start(port).then(() => {
    console.log(`Mock 飞书服务器已启动: http://localhost:${port}`)
  })
}
