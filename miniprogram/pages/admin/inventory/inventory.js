const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const util = require('../../../utils/util')

Page({
  data: {
    items: [],
    categories: [],
    keyword: '',
    selectedCategory: '',
    loading: true,
    // 调整跟踪
    deltas: {},
    reasons: {},
    changeCount: 0,
    totalDelta: 0,
    hasChanges: false,
    submitting: false,
    // 新增货品弹窗
    showAddModal: false,
    addName: '',
    addCategoryId: '',
    addCategoryName: '',
    addQty: '',
    addDesc: '',
    addSaving: false
  },

  onLoad() {
    this.loadCategories()
  },

  onShow() {
    this.loadItems()
  },

  async loadCategories() {
    try {
      const list = await api.getCategoryList()
      this.setData({ categories: list })
    } catch (err) { /* ignore */ }
  },

  async loadItems() {
    this.setData({ loading: true })
    try {
      const params = { status: 'active' }
      if (this.data.keyword) params.keyword = this.data.keyword
      if (this.data.selectedCategory) params.categoryId = this.data.selectedCategory
      const list = await api.getItemList(params)
      this.setData({ items: list }, () => this.resetDeltas())
    } catch (err) { /* ignore */ } finally {
      this.setData({ loading: false })
    }
  },

  resetDeltas() {
    this.setData({ deltas: {}, reasons: {}, changeCount: 0, totalDelta: 0, hasChanges: false })
  },

  updateSummary() {
    const deltas = this.data.deltas
    let count = 0
    let total = 0
    for (const k in deltas) {
      if (deltas[k] !== 0) { count++; total += deltas[k] }
    }
    this.setData({ changeCount: count, totalDelta: total, hasChanges: count > 0 })
  },

  // 搜索
  onSearchInput(e) { this.setData({ keyword: e.detail.value }) },
  onSearch() { this.loadItems() },

  // 分类筛选
  onFilterCategory(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedCategory: id === this.data.selectedCategory ? '' : id })
    this.loadItems()
  },

  // 调整数量
  adjustDelta(e) {
    const id = e.currentTarget.dataset.id
    const delta = Number(e.currentTarget.dataset.delta)
    const deltas = { ...this.data.deltas }
    deltas[id] = (deltas[id] || 0) + delta
    this.setData({ deltas }, () => this.updateSummary())
  },

  onDeltaInput(e) {
    const id = e.currentTarget.dataset.id
    const val = parseInt(e.detail.value, 10)
    const deltas = { ...this.data.deltas }
    if (isNaN(val) || val === 0) {
      delete deltas[id]
    } else {
      deltas[id] = val
    }
    this.setData({ deltas }, () => this.updateSummary())
  },

  onReasonInput(e) {
    const id = e.currentTarget.dataset.id
    const reasons = { ...this.data.reasons }
    reasons[id] = e.detail.value
    this.setData({ reasons })
  },

  // 提交调整
  async onSubmit() {
    if (!this.data.hasChanges) return
    const deltas = this.data.deltas
    const userInfo = auth.getUserInfo()
    this.setData({ submitting: true })

    let done = 0
    let failed = 0
    for (const itemId in deltas) {
      const delta = deltas[itemId]
      if (delta === 0) continue
      const changeType = delta > 0 ? 'stock_in' : 'stock_out'
      const reason = this.data.reasons[itemId] || ''
      try {
        await api.adjustInventory({
          itemId,
          changeType,
          quantity: Math.abs(delta),
          reason,
          operatorName: userInfo.name || ''
        })
        done++
      } catch (err) { failed++ }
    }

    this.setData({ submitting: false })
    if (failed === 0) {
      util.showToast(`已调整 ${done} 件货物`, 'success')
      this.loadItems()
    } else {
      util.showToast(`完成 ${done} 件，失败 ${failed} 件`)
    }
  },

  // 新增货品
  onShowAdd() {
    this.setData({
      showAddModal: true,
      addName: '', addCategoryId: '', addCategoryName: '',
      addQty: '', addDesc: ''
    })
  },
  noop() {},
  onHideAdd() { this.setData({ showAddModal: false }) },
  onAddName(e) { this.setData({ addName: e.detail.value }) },
  onAddQty(e) { this.setData({ addQty: e.detail.value }) },
  onAddDesc(e) { this.setData({ addDesc: e.detail.value }) },
  onAddCategoryPick(e) {
    const idx = Number(e.detail.value)
    const cat = this.data.categories[idx]
    if (cat) this.setData({ addCategoryId: cat._id, addCategoryName: cat.name })
  },

  async onAddSave() {
    const { addName, addCategoryId, addCategoryName, addQty, addDesc } = this.data
    if (!addName.trim()) { util.showToast('请输入货物名称'); return }
    this.setData({ addSaving: true })
    try {
      await api.createItem({
        name: addName.trim(),
        categoryId: addCategoryId,
        categoryName: addCategoryName,
        totalQuantity: Number(addQty) || 0,
        description: addDesc
      })
      util.showToast('添加成功', 'success')
      this.setData({ showAddModal: false, addSaving: false })
      this.loadItems()
      this.loadCategories()
    } catch (err) {
      this.setData({ addSaving: false })
      util.showToast(err.message || '添加失败')
    }
  }
})
