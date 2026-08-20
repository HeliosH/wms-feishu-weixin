/**
 * 骨架屏加载组件
 * @property {boolean} loading - 是否显示
 * @property {number} rowCount - 骨架卡片数量
 */
Component({
  properties: {
    loading: { type: Boolean, value: true },
    rowCount: { type: Number, value: 3 }
  }
})
