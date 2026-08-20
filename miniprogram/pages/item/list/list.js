const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const role = require('../../../utils/role')

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
    this.setData({ isAdmin: role.isWarehouseAdmin(auth.getUserInfo()) })
    this.loadCategories()
    this.loadItems()
  },

  onPullDownRefresh() {
    this.loadItems().then(() => wx.stopPullDownRefresh())
  },

  async loadCategories() {
    try {
      const list = await api.getCategoryList()
      this.setData({ categories: list })
    } catch (err) {
      // ignore
    }
  },

  async loadItems() {
    this.setData({ loading: true })
    try {
      const params = {}
      if (this.data.keyword) params.keyword = this.data.keyword
      if (this.data.selectedCategory) params.categoryId = this.data.selectedCategory
      params.status = 'active'
      const list = await api.getItemList(params)
      this.setData({ items: list })
    } catch (err) {
      console.error(err)
    } finally {
      this.setData({ loading: false })
    }
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.loadItems()
  },

  onFilterCategory(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedCategory: id })
    this.loadItems()
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/item/detail/detail?id=${id}` })
  },

  goAddItem() {
    wx.navigateTo({ url: '/subpackages/admin/pages/inventory/inventory' })
  }
})
