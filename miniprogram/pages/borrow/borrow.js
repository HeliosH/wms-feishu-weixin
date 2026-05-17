const api = require('../../utils/api')
const auth = require('../../utils/auth')
const role = require('../../utils/role')

Page({
  data: {
    items: [],
    categories: [],
    keyword: '',
    selectedCategory: '',
    loading: false,
    isAdmin: false
  },

  onLoad() {
    const userInfo = auth.getUserInfo()
    this.setData({ isAdmin: role.isWarehouseAdmin(userInfo) })
    this.loadData()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [categories, items] = await Promise.all([
        api.getCategoryList(),
        api.getItemList({ status: 'active' })
      ])
      this.setData({ categories, items })
    } catch (err) {
      console.error('加载货物失败:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async doSearch() {
    this.setData({ loading: true })
    try {
      const params = { status: 'active' }
      if (this.data.keyword) params.keyword = this.data.keyword
      if (this.data.selectedCategory) params.categoryId = this.data.selectedCategory
      const items = await api.getItemList(params)
      // 前端搜索过滤
      let filtered = items
      if (this.data.keyword) {
        const kw = this.data.keyword.toLowerCase()
        filtered = items.filter(i => (i.name || '').toLowerCase().includes(kw))
      }
      this.setData({ items: filtered })
    } catch (err) {
      console.error('搜索失败:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.doSearch()
  },

  onFilterCategory(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedCategory: id })
    this.doSearch()
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/item/detail/detail?id=${id}` })
  }
})
