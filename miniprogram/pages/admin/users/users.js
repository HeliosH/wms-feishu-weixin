const api = require('../../../utils/api')
const util = require('../../../utils/util')
const roleUtil = require('../../../utils/role')

const ROLE_TAG_MAP = {
  admin: { label: '管理员', cls: 'tag-red' },
  warehouse_admin: { label: '仓库管理员', cls: 'tag-blue' },
  borrower: { label: '借用人员', cls: 'tag-green' }
}

Page({
  data: {
    users: [],
    showRoleModal: false,
    editIndex: -1,
    editUserName: '',
    roleCheckList: []
  },

  onShow() {
    this.loadUsers()
  },

  async loadUsers() {
    try {
      const list = await api.getUserList()
      const users = list.map(u => {
        const roles = Array.isArray(u.role) ? u.role : (u.role ? u.role.split(',') : [])
        const roleTags = roles.map(r => ROLE_TAG_MAP[r] || { label: r, cls: 'tag-gray' })
        const isPureAdmin = roles.length === 1 && roles[0] === 'admin'
        return { ...u, roles, roleTags, isPureAdmin }
      })
      this.setData({ users })
    } catch (err) {
      util.showToast(err.message)
    }
  },

  // 编辑角色
  onEditRole(e) {
    const index = e.currentTarget.dataset.index
    const user = this.data.users[index]
    const roleCheckList = [
      { value: 'warehouse_admin', label: '仓库管理员', checked: user.roles.includes('warehouse_admin') },
      { value: 'borrower', label: '借用人员', checked: user.roles.includes('borrower') }
    ]
    // admin 角色不可通过 checkbox 增删
    this.setData({
      showRoleModal: true,
      editIndex: index,
      editUserName: user.name || user.openid,
      roleCheckList
    })
  },

  onRoleToggle(e) {
    const idx = e.currentTarget.dataset.index
    const key = `roleCheckList[${idx}].checked`
    this.setData({ [key]: !this.data.roleCheckList[idx].checked })
  },

  onCloseModal() {
    this.setData({ showRoleModal: false })
  },

  async onSaveRole() {
    const user = this.data.users[this.data.editIndex]
    const selected = this.data.roleCheckList.filter(r => r.checked).map(r => r.value)
    // 保留 admin 角色
    if (user.roles.includes('admin')) {
      selected.push('admin')
    }
    if (selected.length === 0) {
      util.showToast('请至少选择一个角色')
      return
    }

    try {
      await api.updateUserRole(user.openid, selected)
      util.showToast('修改成功', 'success')
      this.setData({ showRoleModal: false })
      this.loadUsers()
    } catch (err) {
      util.showToast(err.message)
    }
  },

  onToggleStatus(e) {
    const openid = e.currentTarget.dataset.openid
    const currentStatus = e.currentTarget.dataset.status
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    const action = newStatus === 'inactive' ? '禁用' : '启用'

    wx.showModal({
      title: `确认${action}`,
      content: `确定${action}该用户？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.toggleUserStatus(openid, newStatus)
            util.showToast(`${action}成功`, 'success')
            this.loadUsers()
          } catch (err) {
            util.showToast(err.message)
          }
        }
      }
    })
  }
})
