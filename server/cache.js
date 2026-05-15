const store = new Map()

module.exports = {
  async get(key) {
    const entry = store.get(key)
    if (!entry) return null
    if (entry.expireAt < Date.now() / 1000) {
      store.delete(key)
      return null
    }
    return entry.token
  },
  async set(key, token, expireAt) {
    store.set(key, { token, expireAt })
  }
}
