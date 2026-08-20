// 线性图标组件 —— 统一视觉语言
// 特点：24x24 viewBox / 2px 描边 / 圆角端点 / 单色 stroke
// 用法：<icon name="box" size="40" color="#1890ff" />
const ICONS = {
  // 通用
  'home': '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  'chevron-right': '<path d="M9 5l7 7-7 7"/>',
  'arrow-right': '<path d="M4 12h16"/><path d="M13 5l7 7-7 7"/>',
  // 物品与库存
  'box': '<path d="M21 8.5 12 3.5 3 8.5v7l9 5 9-5v-7Z"/><path d="M3 8.5l9 5 9-5"/><path d="M12 13.5v7"/>',
  'tag': '<path d="M3.5 3.5H11l9.5 9.5-7.5 7.5L3.5 11V3.5z"/><circle cx="8" cy="8" r="1.6"/>',
  'clipboard': '<path d="M9 4h6v3H9z"/><path d="M15 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h4"/>',
  'chart': '<path d="M5 20v-6"/><path d="M12 20V6"/><path d="M19 20v-9"/><path d="M3 20h18"/>',
  'plus-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/>',
  'swap': '<path d="M7 4v13"/><path d="M3.5 13.5 7 17l3.5-3.5"/><path d="M17 20V7"/><path d="M13.5 10.5 17 7l3.5 3.5"/>',
  // 审批与流程
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5.5"/>',
  'lock': '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"/>',
  'download': '<path d="M12 4v11"/><path d="M7.5 11.5 12 16l4.5-4.5"/><path d="M4.5 20h15"/>',
  'upload': '<path d="M12 16V5"/><path d="M7.5 9.5 12 5l4.5 4.5"/><path d="M4.5 20h15"/>',
  'edit': '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  // 人员
  'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  'users': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M17.5 14.2c2.4.9 4 3.1 4 5.8"/>',
  'user-plus': '<circle cx="10" cy="8" r="4"/><path d="M2 21c0-4.4 3.6-7 8-7"/><path d="M19 8v6"/><path d="M16 11h6"/>',
  // 状态与时间
  'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  'refresh': '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  'inbox': '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'settings': '<path d="M4 7h0.8"/><path d="M9.2 7H20"/><circle cx="7" cy="7" r="2.2"/><path d="M4 12h8.8"/><path d="M17.2 12H20"/><circle cx="15" cy="12" r="2.2"/><path d="M4 17h0.8"/><path d="M9.2 17H20"/><circle cx="7" cy="17" r="2.2"/>',
  'camera': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'
};

function buildSvgSrc(name, color) {
  const body = ICONS[name] || ICONS.box;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="'
    + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + body + '</svg>';
  return 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(svg);
}

Component({
  properties: {
    // 图标名称，见上方 ICONS 映射
    name: { type: String, value: 'box' },
    // 描边颜色，支持任意 CSS 色值
    color: { type: String, value: '#1890ff' },
    // 尺寸，单位 rpx
    size: { type: null, value: 40 }
  },

  data: {
    src: ''
  },

  observers: {
    'name, color': function (name, color) {
      this.setData({ src: buildSvgSrc(name, color) });
    }
  },

  lifetimes: {
    attached() {
      if (!this.data.src) {
        this.setData({ src: buildSvgSrc(this.data.name, this.data.color) });
      }
    }
  }
});
