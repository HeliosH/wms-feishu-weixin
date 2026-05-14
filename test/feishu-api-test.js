const fs = require('fs')
const https = require('https')

// 读配置
const config = JSON.parse(fs.readFileSync('../cloudfunctions/feishuConfig.json', 'utf-8')).feishu
const { appId, appSecret, bitableAppToken, tableUsers, tableCategories, tableItems, tableBorrowRecords, tableInventoryLogs } = config

let token = ''

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://open.feishu.cn')
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': `Bearer ${token}` }
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { resolve(data) }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function getToken() {
  console.log('[1/7] 获取 token...')
  // token 接口独立调用，不带 Authorization
  const data = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ app_id: appId, app_secret: appSecret })
    const url = new URL('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal')
    const req = https.request({ hostname: url.hostname, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' } }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(JSON.parse(d)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
  if (data.code !== 0) throw new Error(`Token 获取失败: ${data.msg}`)
  token = data.tenant_access_token
  console.log('  OK')
}

async function listRecords(tableId, name) {
  const res = await request('GET', `/open-apis/bitable/v1/apps/${bitableAppToken}/tables/${tableId}/records?page_size=5`)
  if (res.code !== 0) throw new Error(`${name} 查询失败: ${res.msg} (code ${res.code})`)
  const items = res.data && res.data.items ? res.data.items : []
  console.log(`  记录数: ${items.length}`)
  return items.map(r => r.record_id)
}

async function createRecord(tableId, name, fields) {
  const res = await request('POST', `/open-apis/bitable/v1/apps/${bitableAppToken}/tables/${tableId}/records`, { fields })
  if (res.code !== 0) throw new Error(`${name} 写入失败: ${res.msg} (code ${res.code})`)
  console.log(`  写入成功 record_id: ${res.data.record.record_id}`)
  return res.data.record.record_id
}

async function deleteRecord(tableId, name, id) {
  const res = await request('DELETE', `/open-apis/bitable/v1/apps/${bitableAppToken}/tables/${tableId}/records/${id}`)
  if (res.code !== 0) throw new Error(`${name} 删除失败: ${res.msg}`)
  console.log(`  删除成功`)
}

async function main() {
  console.log('=== 飞书多维表格 API 本地测试 ===\n')
  const ids = {} // 记录测试写入的 record_id 用于清理

  try {
    await getToken()

    // 1. 测试 categories 读写
    console.log('\n[2/7] 测试 categories 表...')
    await listRecords(tableCategories, 'categories')
    ids.cat = await createRecord(tableCategories, 'categories', {
      name: '测试类型-本地测试',
      description: '验证中文不乱码',
      created_at: Date.now()
    })

    // 2. 测试 items 读写
    console.log('\n[3/7] 测试 items 表...')
    await listRecords(tableItems, 'items')
    ids.item = await createRecord(tableItems, 'items', {
      name: '测试货物-本地测试',
      category_id: ids.cat,
      category_name: '测试类型-本地测试',
      total_quantity: 100,
      available_quantity: 100,
      borrowed_quantity: 0,
      description: '验证中文不乱码',
      image_url: '',
      status: 'active',
      created_at: Date.now()
    })

    // 3. 测试 borrow_records 读写
    console.log('\n[4/7] 测试 borrow_records 表...')
    await listRecords(tableBorrowRecords, 'borrow_records')
    ids.borrow = await createRecord(tableBorrowRecords, 'borrow_records', {
      item_id: ids.item,
      item_name: '测试货物-本地测试',
      borrower_id: 'test_user_openid',
      borrower_name: '测试借用人',
      quantity: 2,
      status: 'pending_approval',
      apply_remark: '本地测试申请',
      apply_time: Date.now(),
      apply_photo: '',
      approver_id: '',
      approver_name: '',
      reject_reason: '',
      collect_time: null,
      collect_photo: '',
      collect_operator: '',
      return_time: null,
      return_photo: '',
      return_operator: ''
    })

    // 4. 测试 inventory_logs 读写
    console.log('\n[5/7] 测试 inventory_logs 表...')
    await listRecords(tableInventoryLogs, 'inventory_logs')
    ids.log = await createRecord(tableInventoryLogs, 'inventory_logs', {
      item_id: ids.item,
      item_name: '测试货物-本地测试',
      change_type: 'borrow',
      quantity: 2,
      before_quantity: 100,
      after_quantity: 98,
      reason: '本地测试借出记录',
      operator_id: 'test_admin',
      operator_name: '测试管理员',
      created_at: Date.now()
    })

    // 5. 测试 users 表
    console.log('\n[6/7] 测试 users 表...')
    await listRecords(tableUsers, 'users')

    // 6. 清理
    console.log('\n[7/7] 清理测试数据...')
    await deleteRecord(tableInventoryLogs, 'inventory_logs', ids.log)
    await deleteRecord(tableBorrowRecords, 'borrow_records', ids.borrow)
    await deleteRecord(tableItems, 'items', ids.item)
    await deleteRecord(tableCategories, 'categories', ids.cat)

    console.log('\n=== 全部测试通过 ===')
    console.log('请去飞书多维表格中检查中文是否正常显示（测试数据已自动清理）')
  } catch (err) {
    console.error('\n 测试失败:', err.message)
    // 尝试清理已创建的数据
    for (const [key, id] of Object.entries(ids)) {
      const map = { cat: tableCategories, item: tableItems, borrow: tableBorrowRecords, log: tableInventoryLogs }
      if (map[key]) {
        try { await deleteRecord(map[key], key, id) } catch (e) {}
      }
    }
    process.exit(1)
  }
}

main()
