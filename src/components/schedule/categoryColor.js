/**
 * 分类配色工具：一组预设色板，按分类名哈希稳定取色。
 * 日程日历视图与统计看板共用，保证同一分类在任何图表中颜色一致。
 */

/** 预设色板（浅色/深色模式下均有足够对比度） */
export const CATEGORY_PALETTE = [
  '#3b6fe0', // 蓝
  '#67c23a', // 绿
  '#e6a23c', // 橙
  '#f56c6c', // 红
  '#9b59b6', // 紫
  '#00b8d9', // 青
  '#e67e22', // 深橙
  '#2ecc71', // 翠绿
  '#ec6b9c', // 粉
  '#5f8b8b'  // 灰青
]

/** 分类名 → 稳定的色板颜色 */
export function categoryColor(name) {
  const str = String(name || '默认')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.codePointAt(i)) >>> 0
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length]
}

/** 十六进制颜色加透明度 → rgba() 字符串 */
export function colorWithAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
