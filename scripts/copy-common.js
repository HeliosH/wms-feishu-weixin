/**
 * 部署前脚本 — 将 cloudfunctions/common/ 复制到每个云函数目录
 * 因为微信云开发中每个云函数是独立上传的，不能使用 ../common 相对引用
 *
 * 用法: node scripts/copy-common.js
 */
const fs = require('fs')
const path = require('path')

const cloudDir = path.join(__dirname, '..', 'cloudfunctions')
const commonDir = path.join(cloudDir, 'common')
const targetDirs = ['borrowManage', 'itemManage', 'userManage', 'feishuProxy', 'feishuAuth']

const commonFiles = [
  'feishu-client.js',
  'borrow-logic.js',
  'item-logic.js',
  'user-logic.js',
  'photo.js',
  'index.js'
]

const commonPkg = {
  name: 'common',
  version: '1.0.0',
  main: 'index.js',
  dependencies: { axios: '^1.6.0' }
}

if (!fs.existsSync(commonDir)) {
  console.error('错误: cloudfunctions/common/ 目录不存在')
  process.exit(1)
}

for (const dir of targetDirs) {
  const targetDir = path.join(cloudDir, dir, 'common')
  fs.mkdirSync(targetDir, { recursive: true })

  // 复制源文件
  for (const file of commonFiles) {
    const src = path.join(commonDir, file)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(targetDir, file))
    }
  }

  // 写入 package.json
  fs.writeFileSync(
    path.join(targetDir, 'package.json'),
    JSON.stringify(commonPkg, null, 2)
  )

  console.log(`  OK  ${dir}/common/`)
}

console.log('\n部署前准备工作完成，现在可以上传云函数了')
