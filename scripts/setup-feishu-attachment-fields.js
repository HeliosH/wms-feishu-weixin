/**
 * 飞书多维表格附件字段初始化脚本（幂等，可重复运行）
 *
 * 云函数架构下照片/头像存为飞书附件字段（type 17），需在多维表格中预先创建：
 *   - borrow_records 表: apply_photo_file / collect_photo_file / return_photo_file
 *   - users 表:          avatar_file
 *
 * 飞书 API 不支持修改已有字段类型，因此新增 *_file 后缀字段，
 * 旧文本字段（apply_photo 等）保留，读取时附件优先、文本兜底（见 server/common/photo.js）。
 *
 * 运行前: server/.env 需配置真实飞书凭证（FEISHU_APP_ID / FEISHU_APP_SECRET /
 *         FEISHU_BITABLE_APP_TOKEN / 各表 ID）
 * 运行:   npm run cloud:setup-fields
 */
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const http = axios.create({ proxy: false })

// ---- 读取 server/.env ----
function loadEnv(file) {
  const env = {}
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    if (line.trim().startsWith('#')) continue
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const ENV_PATH = path.join(__dirname, '..', 'server', '.env')
if (!fs.existsSync(ENV_PATH)) {
  console.error('错误: 未找到 server/.env，请先配置飞书凭证（参考 server/.env.example）')
  process.exit(1)
}
const ENV = loadEnv(ENV_PATH)

const APP_TOKEN = ENV.FEISHU_BITABLE_APP_TOKEN
const FIELD_TYPE_ATTACHMENT = 17

// 待创建的附件字段清单：表 ID 环境变量 → 字段名列表
const PLAN = [
  {
    table: 'borrow_records',
    tableId: ENV.FEISHU_TABLE_BORROW_RECORDS,
    fields: ['apply_photo_file', 'collect_photo_file', 'return_photo_file']
  },
  {
    table: 'users',
    tableId: ENV.FEISHU_TABLE_USERS,
    fields: ['avatar_file']
  }
]

if (!APP_TOKEN || !ENV.FEISHU_APP_ID || !ENV.FEISHU_APP_SECRET) {
  console.error('错误: .env 缺少 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_BITABLE_APP_TOKEN')
  process.exit(1)
}
for (const p of PLAN) {
  if (!p.tableId) {
    console.error(`错误: .env 缺少表 ID（${p.table}）`)
    process.exit(1)
  }
}

// ---- 获取 tenant_access_token ----
async function getToken() {
  const res = await http.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: ENV.FEISHU_APP_ID,
    app_secret: ENV.FEISHU_APP_SECRET
  }, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  if (res.data.code !== 0) throw new Error(`获取 token 失败: ${res.data.msg}`)
  return res.data.tenant_access_token
}

// ---- 分页列出表内全部字段 ----
async function listFields(token, tableId) {
  const fields = []
  let pageToken = ''
  let hasMore = true
  // 注意: 飞书在 has_more=false 时仍可能返回非空 page_token，必须以 has_more 控制循环
  while (hasMore) {
    const res = await http.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/fields`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) }
      }
    )
    if (res.data.code !== 0) throw new Error(`列出字段失败: ${res.data.msg}`)
    fields.push(...(res.data.data.items || []))
    hasMore = !!res.data.data.has_more
    pageToken = res.data.data.page_token || ''
  }
  return fields
}

async function createField(token, tableId, fieldName) {
  const res = await http.post(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/fields`,
    { field_name: fieldName, type: FIELD_TYPE_ATTACHMENT },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' } }
  )
  if (res.data.code !== 0) throw new Error(`创建字段 ${fieldName} 失败: ${res.data.msg}`)
  return res.data.data.field
}

// ================================================================
async function main() {
  console.log('飞书附件字段初始化')
  console.log(`  app_token: ${APP_TOKEN}`)
  const token = await getToken()
  console.log('  tenant_access_token: 已获取\n')

  let created = 0, skipped = 0

  for (const p of PLAN) {
    console.log(`[${p.table}] (${p.tableId})`)
    const existing = await listFields(token, p.tableId)
    const existingNames = new Set(existing.map(f => f.field_name))

    for (const fieldName of p.fields) {
      if (existingNames.has(fieldName)) {
        const field = existing.find(f => f.field_name === fieldName)
        if (field.type !== FIELD_TYPE_ATTACHMENT) {
          console.log(`  ✗ ${fieldName} 已存在但类型不是附件(type ${field.type})，` +
            `飞书不支持改类型，请手动删除后重跑本脚本`)
          process.exitCode = 1
        } else {
          console.log(`  - ${fieldName}: 已存在（附件类型），跳过`)
          skipped++
        }
      } else {
        await createField(token, p.tableId, fieldName)
        console.log(`  + ${fieldName}: 已创建（附件类型）`)
        created++
      }
    }
    console.log('')
  }

  console.log('========================================')
  console.log(`  新建: ${created}  |  已存在跳过: ${skipped}`)
  console.log('========================================')
  if (created > 0) {
    console.log('\n提示: 请在飞书多维表格中确认新字段顺序/描述，随后即可运行 npm run test:real 验证附件链路。')
  }
}

main().catch(err => {
  console.error(`\n执行失败: ${err.message}`)
  process.exit(1)
})
