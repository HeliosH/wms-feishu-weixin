/**
 * 通用弹窗组件
 * @property {boolean} visible - 是否显示
 * @property {string} title - 标题
 * @property {boolean} showButtons - 是否显示底部按钮
 * @property {boolean} showCancel - 是否显示取消按钮
 * @property {string} cancelText - 取消按钮文字
 * @property {string} confirmText - 确认按钮文字
 * @property {boolean} maskClosable - 点击遮罩是否关闭
 * @event confirm - 确认
 * @event cancel - 取消
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    showButtons: { type: Boolean, value: true },
    showCancel: { type: Boolean, value: true },
    cancelText: { type: String, value: '取消' },
    confirmText: { type: String, value: '确定' },
    maskClosable: { type: Boolean, value: true },
    width: { type: String, value: '80%' }
  },

  methods: {
    onMaskTap() {
      if (this.data.maskClosable) {
        this.triggerEvent('cancel')
      }
    },

    onCancel() {
      this.triggerEvent('cancel')
    },

    onConfirm() {
      this.triggerEvent('confirm')
    },

    noop() {}
  }
})
