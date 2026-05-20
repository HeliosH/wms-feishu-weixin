const api = require('../../utils/api')
const auth = require('../../utils/auth')
const role = require('../../utils/role')
const util = require('../../utils/util')

Page({
  data: {
    activeTab: 'inventory',
    // 仓库总览
    overviewItems: [],
    overviewLoading: true,
    // 流程管理 - 徽标数
    pendingBorrowCount: 0,
    approvedCount: 0,
    collectedCount: 0,
    pendingRoleCount: 0,
    // 角色管理 - 用户列表
    users: [],
    usersLoading: false,
    showRoleModal: false,
    roleEditUser: null,
    roleCheckList: []
  },

  onShow() {
    const userInfo = auth.getUserInfo()
    if (!role.isWarehouseAdmin(userInfo)) {
      util.showToast('无管理权限')
      return
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.loadOverview()
    this.loadBadgeCounts()
  },

  // ===== 仓库总览 =====
  async loadOverview() {
    this.setData({ overviewLoading: true })
    try {
      const items = await api.getItemList({ status: 'active' })
      const borrowed = items
        .filter(i => (i.borrowed_quantity || 0) > 0)
        .sort((a, b) => (b.borrowed_quantity || 0) - (a.borrowed_quantity || 0))
      this.setData({ overviewItems: borrowed })
    } catch (err) { /* ignore */ } finally {
      this.setData({ overviewLoading: false })
    }
  },

  // ===== 徽标数 =====
  async loadBadgeCounts() {
    try {
      const [pendingBorrow, approved, collected, allUsers] = await Promise.all([
        api.getBorrowList({ status: 'pending_approval' }),
        api.getBorrowList({ status: 'approved' }),
        api.getBorrowList({ status: 'collected' }),
        api.getUserList()
      ])
      this.setData({
        pendingBorrowCount: pendingBorrow.length || 0,
        approvedCount: approved.length || 0,
        collectedCount: collected.length || 0,
        pendingRoleCount: allUsers.filter(u => u.status === 'pending_review').length || 0
      })
    } catch (err) { /* ignore */ }
  },

  // ===== 子 Tab =====
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (tab === 'role') {
      this.loadUsers()
    }
  },

  // ===== 总览 - 点击货物卡片 =====
  goItemBorrowers(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/admin/item-borrowers/item-borrowers?itemId=${id}` })
  },

  // ===== 通用导航 =====
  goPage(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },

  // ===== 角色管理 =====
  async loadUsers() {
    this.setData({ usersLoading: true })
    try {
      const list = await api.getUserList()
      const users = list.map(u => {
        const roles = Array.isArray(u.role) ? u.role : (u.role ? u.role.split(',') : [])
        const isPureAdmin = roles.length === 1 && roles[0] === 'admin'
        return { ...u, roles, isPureAdmin }
      })
      this.setData({ users })
    } catch (err) { /* ignore */ } finally {
      this.setData({ usersLoading: false })
    }
  },

  onEditRole(e) {
    const index = e.currentTarget.dataset.index
    const user = this.data.users[index]
    const roleCheckList = [
      { value: 'warehouse_admin', label: '仓库管理员', checked: user.roles.includes('warehouse_admin') },
      { value: 'borrower', label: '借用人员', checked: user.roles.includes('borrower') }
    ]
    this.setData({ showRoleModal: true, roleEditUser: user, roleCheckList })
  },

  onRoleToggle(e) {
    const idx = e.currentTarget.dataset.index
    const key = `roleCheckList[${idx}].checked`
    this.setData({ [key]: !this.data.roleCheckList[idx].checked })
  },

  noop() {},

  onCloseModal() {
    this.setData({ showRoleModal: false, roleEditUser: null })
  },

  async onSaveRole() {
    const user = this.data.roleEditUser
    if (!user) return
    let selected = this.data.roleCheckList.filter(r => r.checked).map(r => r.value)
    if (user.roles.includes('admin')) selected.push('admin')
    if (selected.length === 0) { util.showToast('请至少选择一个角色'); return }
    try {
      await api.updateUserRole(user.openid, selected)
      util.showToast('修改成功', 'success')
      this.setData({ showRoleModal: false, roleEditUser: null })
      this.loadUsers()
      this.loadBadgeCounts()
    } catch (err) { util.showToast(err.message) }
  },

  onToggleStatus(e) {
    const openid = e.currentTarget.dataset.openid
    const currentStatus = e.currentTarget.dataset.status
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    wx.showModal({
      title: `确认${newStatus === 'inactive' ? '禁用' : '启用'}`,
      content: `确定${newStatus === 'inactive' ? '禁用' : '启用'}该用户？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.toggleUserStatus(openid, newStatus)
            util.showToast('操作成功', 'success')
            this.loadUsers()
          } catch (err) { util.showToast(err.message) }
        }
      }
    })
  }
})
