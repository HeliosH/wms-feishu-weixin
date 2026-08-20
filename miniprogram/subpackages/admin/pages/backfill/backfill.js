const api = require('../../../../utils/api')
const util = require('../../../../utils/util')

Page({
  data: {
    items: [],
    itemNames: [],
    users: [],
    userNames: [],
    selectedItemId: '',
    selectedItemName: '',
    selectedUserOpenid: '',
    selectedUserName: '',
    quantity: '',
    applyDate: '',
    photoUrl: '',
    remark: '',
    submitting: false
  },

  onLoad() {
    this.loadItems()
    this.loadUsers()
  },

  async loadItems() {
    try {
      const list = await api.getItemList({ status: 'active' })
      this.setData({
        items: list,
        itemNames: list.map(i => `${i.name} (可用:${i.available_quantity})`)
      })
    } catch (err) { /* ignore */ }
  },

  async loadUsers() {
    try {
      const list = await api.getUserList()
      const active = list.filter(u => u.status === 'active')
      this.setData({
        users: active,
        userNames: active.map(u => u.name || u.openid)
      })
    } catch (err) { /* ignore */ }
  },

  onItemPick(e) {
    const idx = e.detail.value
    const item = this.data.items[idx]
    if (item) {
      this.setData({ selectedItemId: item._id, selectedItemName: item.name })
    }
  },

  onUserPick(e) {
    const idx = e.detail.value
    const user = this.data.users[idx]
    if (user) {
      this.setData({ selectedUserOpenid: user.openid, selectedUserName: user.name })
    }
  },

  onQuantityInput(e) { this.setData({ quantity: e.detail.value }) },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }) },

  onDatePick(e) {
    this.setData({ applyDate: e.detail.value })
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
          // 提交时用原始相对路径，预览时解析为完整 URL
          this._photoFileId = fileID
          this.setData({ photoUrl: util.resolveFileUrl(fileID) })
        } catch (err) {
          util.hideLoading()
          util.showToast('上传失败')
        }
      }
    })
  },

  async onSubmit() {
    if (!this.data.selectedItemId) { util.showToast('请选择货物'); return }
    if (!this.data.selectedUserOpenid) { util.showToast('请选择借用人'); return }
    const qty = Number(this.data.quantity)
    if (!qty || qty <= 0) { util.showToast('请输入有效数量'); return }
    if (!this.data.photoUrl) { util.showToast('请先拍照留档'); return }

    this.setData({ submitting: true })
    try {
      const applyTime = this.data.applyDate ? new Date(this.data.applyDate).getTime() : Date.now()
      await api.backfillBorrow({
        itemId: this.data.selectedItemId,
        borrowerOpenid: this.data.selectedUserOpenid,
        quantity: qty,
        remark: this.data.remark,
        applyTime,
        photoUrl: this._photoFileId
      })
      util.showToast('补录成功', 'success')
      setTimeout(() => {
        wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/manage/manage' }) })
      }, 1000)
    } catch (err) {
      util.showToast(err.message || '补录失败')
    } finally {
      this.setData({ submitting: false })
    }
  }
})
