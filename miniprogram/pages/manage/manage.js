const auth = require('../../utils/auth')
const role = require('../../utils/role')
const util = require('../../utils/util')
const { userService, itemService, borrowService } = require('../../services/index')

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
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadOverview()
    this.loadBadgeCounts()
  },

  // ===== 仓库总览 =====
  async loadOverview() {
    this.setData({ overviewLoading: true })
    try {
      const items = await itemService.getItemList({ status: 'active' })
      const borrowed = items
        .filter(i => (i.borrowed_quantity || 0) > 0)
        .sort((a, b) => (b.borrowed_quantity || 0) - (a.borrowed_quantity || 0))
      this.setData({ overviewItems: borrowed })
    } catch (err) { /* 错误已由 request 层统一 toast */ } finally {
      this.setData({ overviewLoading: false })
    }
  },

  // ===== 徽标数（并行请求，单次 setData）=====
  async loadBadgeCounts() {
    const [pendingBorrow, approved, collected, allUsers] = await Promise.allSettled([
      borrowService.getBorrowList({ status: 'pending_approval' }),
      borrowService.getBorrowList({ status: 'approved' }),
      borrowService.getBorrowList({ status: 'collected' }),
      userService.getUserList()
    ])

    const updates = {}
    if (pendingBorrow.status === 'fulfilled') updates.pendingBorrowCount = pendingBorrow.value.length || 0
    if (approved.status === 'fulfilled') updates.approvedCount = approved.value.length || 0
    if (collected.status === 'fulfilled') updates.collectedCount = collected.value.length || 0
    if (allUsers.status === 'fulfilled') {
      updates.pendingRoleCount = allUsers.value.filter(u => u.status === 'pending_review').length || 0
    }
    if (Object.keys(updates).length) this.setData(updates)
  },

  // ===== 子 Tab =====
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    if (tab === 'role' && !this.data.users.length) {
      this.loadUsers()
    }
  },

  // ===== 总览 - 点击货物卡片 =====
  goItemBorrowers(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/admin/pages/item-borrowers/item-borrowers?itemId=${id}` })
  },

  // ===== 通用导航 =====
  goPage(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },

  // ===== 角色管理 =====
  async loadUsers() {
    this.setData({ usersLoading: true })
    try {
      const list = await userService.getUserList()
      const users = list.map(u => {
        const roles = Array.isArray(u.role) ? u.role : (u.role ? u.role.split(',') : [])
        const isPureAdmin = roles.length === 1 && roles[0] === role.ROLES.ADMIN
        return { ...u, roles, isPureAdmin }
      })
      this.setData({ users })
    } catch (err) { /* 错误已由 request 层统一 toast */ } finally {
      this.setData({ usersLoading: false })
    }
  },

  onEditRole(e) {
    const index = e.currentTarget.dataset.index
    const user = this.data.users[index]
    const roleCheckList = [
      { value: role.ROLES.WAREHOUSE_ADMIN, label: '仓库管理员', checked: user.roles.includes(role.ROLES.WAREHOUSE_ADMIN) },
      { value: role.ROLES.BORROWER, label: '借用人员', checked: user.roles.includes(role.ROLES.BORROWER) }
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
    if (user.roles.includes(role.ROLES.ADMIN)) selected.push(role.ROLES.ADMIN)
    if (selected.length === 0) { util.showToast('请至少选择一个角色'); return }

    util.showLoading('保存中')
    try {
      await userService.updateUserRole(user.openid, selected)
      util.hideLoading()
      util.showToast('修改成功', 'success')
      this.setData({ showRoleModal: false, roleEditUser: null })
      this.loadUsers()
      this.loadBadgeCounts()
    } catch (err) {
      util.hideLoading()
      util.showToast(err.message || '保存失败')
    }
  },

  async onToggleStatus(e) {
    const openid = e.currentTarget.dataset.openid
    const currentStatus = e.currentTarget.dataset.status
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    const actionText = newStatus === 'inactive' ? '禁用' : '启用'

    const confirmed = await util.confirm(`确认${actionText}`, `确定${actionText}该用户？`)
    if (!confirmed) return

    try {
      await userService.toggleUserStatus(openid, newStatus)
      util.showToast('操作成功', 'success')
      this.loadUsers()
    } catch (err) { /* 错误已由 request 层统一 toast */ }
  }
})
