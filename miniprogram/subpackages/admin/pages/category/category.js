const api = require('../../../../utils/api')
const util = require('../../../../utils/util')

Page({
  data: {
    categories: [],
    showModal: false,
    isEdit: false,
    editId: '',
    formName: '',
    formDesc: ''
  },

  onLoad() {
    this.loadList()
  },

  onShow() {
    this.loadList()
  },

  async loadList() {
    try {
      const list = await api.getCategoryList()
      this.setData({ categories: list })
    } catch (err) {
      util.showToast(err.message)
    }
  },

  onAdd() {
    this.setData({ showModal: true, isEdit: false, editId: '', formName: '', formDesc: '' })
  },

  onEdit(e) {
    const idx = e.currentTarget.dataset.index
    const cat = this.data.categories[idx]
    this.setData({
      showModal: true,
      isEdit: true,
      editId: cat._id,
      formName: cat.name,
      formDesc: cat.description || ''
    })
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '确认删除',
      content: `确定删除类型「${name}」？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteCategory(id)
            util.showToast('删除成功', 'success')
            this.loadList()
          } catch (err) {
            util.showToast(err.message)
          }
        }
      }
    })
  },

  onNameInput(e) {
    this.setData({ formName: e.detail.value })
  },

  onDescInput(e) {
    this.setData({ formDesc: e.detail.value })
  },

  noop() {},

  onCloseModal() {
    this.setData({ showModal: false })
  },

  async onSave() {
    if (!this.data.formName.trim()) {
      util.showToast('请输入类型名称')
      return
    }

    util.showLoading('保存中')
    try {
      if (this.data.isEdit) {
        await api.updateCategory(this.data.editId, {
          name: this.data.formName,
          description: this.data.formDesc
        })
      } else {
        await api.createCategory({
          name: this.data.formName,
          description: this.data.formDesc
        })
      }
      util.hideLoading()
      util.showToast('保存成功', 'success')
      this.setData({ showModal: false })
      this.loadList()
    } catch (err) {
      util.hideLoading()
      util.showToast(err.message)
    }
  }
})
