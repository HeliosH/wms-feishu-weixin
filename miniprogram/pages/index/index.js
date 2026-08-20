const auth = require('../../utils/auth')
const role = require('../../utils/role')
const util = require('../../utils/util')
const { userService, itemService, borrowService } = require('../../services/index')

// 统计卡点击跳转映射（在 wxml 中通过 dataset.url 跳转）
Page({
  data: {
    userInfo: null,
    roleLabel: '',
    isWarehouseAdmin: false,
    isBorrower: false,
    needApplyRole: false,
    statsLoading: true,

    // ===== 普通用户视角统计 =====
    userStats: {
      collected: 0,      // 借用中（在手）
      borrowing: 0,      // 借用流程中（待审批 + 待领取）
      returning: 0       // 归还流程中（待归还）
    },

    // ===== 管理员视角统计 =====
    adminStats: {
      totalStock: 0,     // 总库存
      availableStock: 0, // 可用库存
      activeBorrows: 0,  // 借用总量（进行中）
      borrowing: 0,      // 借用流程中
      returning: 0       // 归还流程中
    },

    // 管理员快捷入口徽标
    pendingApprovalCount: 0,
    pendingCollectCount: 0,
    pendingRoleCount: 0
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }

    const userInfo = auth.getUserInfo()
    if (!userInfo) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }

    this.setData({
      userInfo,
      roleLabel: role.getRoleLabel(userInfo.role),
      isWarehouseAdmin: role.isWarehouseAdmin(userInfo),
      isBorrower: role.canBorrow(userInfo),
      needApplyRole: role.needApplyRole(userInfo)
    })

    // 权限申请审批中，本地缓存可能滞后，静默刷新
    if (userInfo.status === 'pending_review') {
      this.refreshUserStatus()
      return
    }

    this.loadStats()
  },

  async refreshUserStatus() {
    try {
      const userInfo = await auth.doLogin()
      this.setData({
        userInfo,
        roleLabel: role.getRoleLabel(userInfo.role),
        isWarehouseAdmin: role.isWarehouseAdmin(userInfo),
        isBorrower: role.canBorrow(userInfo),
        needApplyRole: role.needApplyRole(userInfo)
      })
      this.loadStats()
    } catch (err) { /* 静默失败，下次 onShow 会重试 */ }
  },

  /**
   * 按角色并行加载统计数据，单次 setData 批量更新
   */
  async loadStats() {
    this.setData({ statsLoading: true })
    const { userInfo, isWarehouseAdmin, isBorrower } = this.data

    if (isWarehouseAdmin) {
      await this.loadAdminStats()
    } else if (isBorrower) {
      await this.loadUserStats(userInfo)
    } else {
      this.setData({ statsLoading: false })
    }
  },

  /**
   * 普通用户：借用中 / 借用流程中 / 归还流程中
   */
  async loadUserStats(userInfo) {
    const [pending, approved, collected] = await Promise.allSettled([
      borrowService.getBorrowList({ borrowerId: userInfo.openid, status: 'pending_approval' }),
      borrowService.getBorrowList({ borrowerId: userInfo.openid, status: 'approved' }),
      borrowService.getBorrowList({ borrowerId: userInfo.openid, status: 'collected' })
    ])

    const pendingCount = pending.status === 'fulfilled' ? pending.value.length : 0
    const approvedCount = approved.status === 'fulfilled' ? approved.value.length : 0
    const collectedCount = collected.status === 'fulfilled' ? collected.value.length : 0

    this.setData({
      'userStats.collected': collectedCount,
      'userStats.borrowing': pendingCount + approvedCount,
      'userStats.returning': collectedCount,
      statsLoading: false
    })
  },

  /**
   * 管理员：总库存 / 借用总量 / 借用流程中 / 归还流程中 + 待办徽标
   */
  async loadAdminStats() {
    const [items, allBorrows, allUsers] = await Promise.allSettled([
      itemService.getItemList({ status: 'active' }),
      borrowService.getBorrowList({}),
      userService.getUserList()
    ])

    const updates = { statsLoading: false }

    if (items.status === 'fulfilled') {
      let total = 0
      let available = 0
      items.value.forEach(i => {
        total += Number(i.total_quantity) || 0
        available += Number(i.available_quantity) || 0
      })
      updates['adminStats.totalStock'] = total
      updates['adminStats.availableStock'] = available
    }

    if (allBorrows.status === 'fulfilled') {
      const list = allBorrows.value
      const pending = list.filter(r => r.status === 'pending_approval').length
      const approved = list.filter(r => r.status === 'approved').length
      const collected = list.filter(r => r.status === 'collected').length
      updates['adminStats.activeBorrows'] = pending + approved + collected
      updates['adminStats.borrowing'] = pending + approved
      updates['adminStats.returning'] = collected
      updates.pendingApprovalCount = pending
      updates.pendingCollectCount = approved
    }

    if (allUsers.status === 'fulfilled') {
      updates.pendingRoleCount = allUsers.value.filter(u => u.status === 'pending_review').length || 0
    }

    this.setData(updates)
  },

  // ===== 导航 =====
  goPage(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },

  goManageTab() {
    wx.switchTab({ url: '/pages/manage/manage' })
  },

  goBorrow() {
    wx.navigateTo({ url: '/pages/borrow/apply/apply' })
  },

  goReturn() {
    wx.navigateTo({ url: '/pages/borrow/return/return' })
  },

  onPullDownRefresh() {
    this.loadStats().then(() => wx.stopPullDownRefresh())
  },

  onLogout() {
    util.confirm('提示', '确定退出登录？').then(confirmed => {
      if (confirmed) auth.logout()
    })
  }
})
