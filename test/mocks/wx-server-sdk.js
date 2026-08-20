/**
 * wx-server-sdk 模拟实现（云函数本地测试用）
 *
 * 通过 Module._resolveFilename 劫持，把 `require('wx-server-sdk')` 重定向到本文件。
 * 覆盖云函数代码实际用到的 API 子集：
 *   - cloud.init / cloud.DYNAMIC_CURRENT_ENV
 *   - cloud.getWXContext()         → 可变 OPENID
 *   - cloud.database()             → 内存版 system_cache 集合（token 缓存）
 *   - cloud.downloadFile(fileID)   → 内存云存储
 *
 * 测试可通过 __state 操控内部状态：
 *   - mock.__state.openid          当前调用者 OPENID
 *   - mock.__state.cloudFiles      Map<fileID, Buffer> 模拟云存储
 */
const state = {
  openid: 'cf_test_admin',
  cloudFiles: new Map(),
  collections: { system_cache: [] } // { _id, key, token, expire_at }
}

let idSeq = 0

function makeCollection(rows) {
  return {
    where(query) {
      const filtered = rows.filter(r => Object.entries(query).every(([k, v]) => r[k] === v))
      return {
        async get() { return { data: filtered.map(r => ({ ...r })) } },
        async update() { throw new Error('mock: 请通过 doc().update() 更新') }
      }
    },
    doc(id) {
      const idx = rows.findIndex(r => r._id === id)
      return {
        async update(data) {
          if (idx === -1) throw new Error('mock: document not exists')
          Object.assign(rows[idx], data)
          return { stats: { updated: 1 } }
        },
        async remove() {
          if (idx === -1) throw new Error('mock: document not exists')
          rows.splice(idx, 1)
          return { stats: { removed: 1 } }
        }
      }
    },
    async add({ data }) {
      const doc = { _id: `mockdoc_${++idSeq}`, ...data }
      rows.push(doc)
      return { _id: doc._id }
    }
  }
}

const mock = {
  DYNAMIC_CURRENT_ENV: 'DYNAMIC_CURRENT_ENV',

  init() { /* noop */ },

  getWXContext() {
    return { OPENID: state.openid, APPID: 'wx-test-appid', UNIONID: '' }
  },

  database() {
    return {
      collection(name) {
        if (!state.collections[name]) state.collections[name] = []
        return makeCollection(state.collections[name])
      },
      command: {}
    }
  },

  async downloadFile({ fileID }) {
    const content = state.cloudFiles.get(fileID)
    if (!content) {
      throw new Error(`mock: 云存储文件不存在 ${fileID}`)
    }
    return { fileContent: content, statusCode: 200 }
  },

  __state: state
}

module.exports = mock
