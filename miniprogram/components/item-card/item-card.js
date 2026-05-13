Component({
  properties: {
    item: { type: Object, value: {} },
    statusLabel: { type: String, value: '' },
    statusTagClass: { type: String, value: '' }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { item: this.data.item })
    }
  }
})
