const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data: {
    itemId: '',
    selectedItemName: '',
    availableQty: 0,
    items: [],
    itemNames: [],
    quantity: '',
    remark: '',
    photoUrl: '',
    submitting: false
  },

  onLoad(options) {
    if (options.itemId) {
      this.setData({ itemId: options.itemId })
      this.loadItemDetail(options.itemId)
    }
    this.loadItems()
  },

  async loadItemDetail(id) {
    try {
      const item = await api.getItemDetail(id)
      this.setData({
        selectedItemName: item.name,
        availableQty: item.available_quantity
      })
    } catch (err) {
      util.showToast(err.message)
    }
  },

  async loadItems() {
    try {
      const list = await api.getItemList({ status: 'active' })
      const names = list.map(i => i.name)
      this.setData({ items: list, itemNames: names })
    } catch (err) {
      // ignore
    }
  },

  onItemPick(e) {
    const idx = e.detail.value
    const item = this.data.items[idx]
    if (item) {
      this.setData({
        itemId: item._id,
        selectedItemName: item.name,
        availableQty: item.available_quantity
      })
    }
  },

  onQuantityInput(e) {
    this.setData({ quantity: e.detail.value })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  onTakePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        util.showLoading('上传中')
        try {
          const fileID = await api.uploadPhoto(tempPath)
          util.hideLoading()
          this.setData({ photoUrl: fileID })
        } catch (err) {
          util.hideLoading()
          util.showToast('上传失败')
        }
      }
    })
  },

  async onSubmit() {
    if (!this.data.itemId) {
      util.showToast('请选择货物')
      return
    }
    const qty = Number(this.data.quantity)
    if (!qty || qty <= 0) {
      util.showToast('请输入有效数量')
      return
    }
    if (qty > this.data.availableQty) {
      util.showToast(`数量不能超过可用库存 ${this.data.availableQty}`)
      return
    }
    if (!this.data.photoUrl) {
      util.showToast('请先拍照留档')
      return
    }

    this.setData({ submitting: true })
    try {
      await api.applyBorrow({
        itemId: this.data.itemId,
        quantity: qty,
        remark: this.data.remark,
        photoUrl: this.data.photoUrl
      })
      util.showToast('申请已提交', 'success')
      setTimeout(() => {
        wx.navigateBack()
      }, 1000)
    } catch (err) {
      util.showToast(err.message || '提交失败')
    } finally {
      this.setData({ submitting: false })
    }
  }
})
