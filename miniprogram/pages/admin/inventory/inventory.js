const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const util = require('../../../utils/util')

Page({
  data: {
    isEdit: false,
    isAdjust: false,
    itemId: '',
    itemName: '',
    currentAvailable: 0,
    // 表单
    formName: '',
    formCategoryId: '',
    formCategoryName: '',
    formQuantity: '',
    formDesc: '',
    categories: [],
    categoryNames: [],
    saving: false,
    // 库存调整
    adjustTypes: [
      { value: 'stock_in', label: '入库' },
      { value: 'stock_out', label: '出库' },
      { value: 'adjust', label: '盘点调整' }
    ],
    adjustType: 'stock_in',
    adjustTypeLabel: '入库',
    adjustQty: '',
    adjustReason: ''
  },

  onLoad(options) {
    this.loadCategories()
    if (options.id) {
      // 编辑模式 — 检查是否是库存调整
      this.setData({ itemId: options.id })
      this.loadItem(options.id)
    }
  },

  async loadCategories() {
    try {
      const list = await api.getCategoryList()
      this.setData({
        categories: list,
        categoryNames: list.map(c => c.name)
      })
    } catch (err) {
      // ignore
    }
  },

  async loadItem(id) {
    try {
      const item = await api.getItemDetail(id)
      this.setData({
        isEdit: true,
        formName: item.name,
        formCategoryId: item.category_id,
        formCategoryName: item.category_name,
        formQuantity: item.total_quantity,
        formDesc: item.description || '',
        itemName: item.name,
        currentAvailable: item.available_quantity
      })
    } catch (err) {
      util.showToast(err.message)
    }
  },

  onNameInput(e) { this.setData({ formName: e.detail.value }) },
  onQuantityInput(e) { this.setData({ formQuantity: e.detail.value }) },
  onDescInput(e) { this.setData({ formDesc: e.detail.value }) },

  onCategoryPick(e) {
    const idx = e.detail.value
    const cat = this.data.categories[idx]
    if (cat) {
      this.setData({ formCategoryId: cat._id, formCategoryName: cat.name })
    }
  },

  onAdjustTypePick(e) {
    const idx = e.detail.value
    const type = this.data.adjustTypes[idx]
    this.setData({ adjustType: type.value, adjustTypeLabel: type.label })
  },

  onAdjustQtyInput(e) { this.setData({ adjustQty: e.detail.value }) },
  onAdjustReasonInput(e) { this.setData({ adjustReason: e.detail.value }) },

  switchToAdjust() {
    this.setData({ isAdjust: true })
  },

  async onSave() {
    if (!this.data.formName.trim()) {
      util.showToast('请输入货物名称')
      return
    }

    this.setData({ saving: true })
    try {
      if (this.data.isEdit) {
        await api.updateItem(this.data.itemId, {
          name: this.data.formName,
          categoryId: this.data.formCategoryId,
          categoryName: this.data.formCategoryName,
          description: this.data.formDesc
        })
      } else {
        const qty = Number(this.data.formQuantity) || 0
        await api.createItem({
          name: this.data.formName,
          categoryId: this.data.formCategoryId,
          categoryName: this.data.formCategoryName,
          totalQuantity: qty,
          description: this.data.formDesc
        })
      }
      util.showToast('保存成功', 'success')
      setTimeout(() => wx.navigateBack(), 500)
    } catch (err) {
      util.showToast(err.message)
    } finally {
      this.setData({ saving: false })
    }
  },

  async onAdjust() {
    const qty = Number(this.data.adjustQty)
    if (!qty || qty <= 0) {
      util.showToast('请输入有效数量')
      return
    }

    this.setData({ saving: true })
    try {
      const userInfo = auth.getUserInfo()
      await api.adjustInventory({
        itemId: this.data.itemId,
        changeType: this.data.adjustType,
        quantity: qty,
        reason: this.data.adjustReason,
        operatorName: userInfo.name || ''
      })
      util.showToast('调整成功', 'success')
      setTimeout(() => wx.navigateBack(), 500)
    } catch (err) {
      util.showToast(err.message)
    } finally {
      this.setData({ saving: false })
    }
  }
})
