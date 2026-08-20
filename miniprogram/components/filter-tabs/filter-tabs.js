/**
 * 筛选标签栏组件
 * @property {Array} tabs - [{ label, value, count }]
 * @property {String|Number} value - 当前选中值
 * @event change - 选中的 value 和 index
 */
Component({
  properties: {
    tabs: { type: Array, value: [] },
    value: { type: null, value: '' }
  },

  data: {
    currentValue: ''
  },

  observers: {
    'value': function(val) {
      this.setData({ currentValue: val })
    }
  },

  lifetimes: {
    attached() {
      this.setData({ currentValue: this.data.value })
    }
  },

  methods: {
    onSelect(e) {
      const { value, index } = e.currentTarget.dataset
      if (value === this.data.currentValue) return
      this.setData({ currentValue: value })
      this.triggerEvent('change', { value, index })
    }
  }
})
