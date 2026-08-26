<!--
  环形占比图（纯 SVG 自绘，不依赖第三方图表库）
  - props.data: { 分类名: 数量 }
  - 颜色与日历视图共用 categoryColor（同分类同色）
-->
<template>
  <div class="donut-chart">
    <div class="chart-title">{{ title }}</div>
    <div v-if="total > 0" class="donut-body">
      <svg viewBox="0 0 200 200" class="donut-svg">
        <g transform="rotate(-90 100 100)">
          <circle
            v-for="seg in segments"
            :key="seg.label"
            cx="100"
            cy="100"
            :r="R"
            fill="none"
            :stroke="seg.color"
            :stroke-width="hoverLabel === seg.label ? 30 : 24"
            :stroke-dasharray="`${seg.len} ${C - seg.len}`"
            :stroke-dashoffset="-seg.offset"
            class="seg"
            @mouseenter="hoverLabel = seg.label"
            @mouseleave="hoverLabel = ''"
          >
            <title>{{ seg.label }}：{{ seg.value }}（{{ seg.pct }}%）</title>
          </circle>
        </g>
        <!-- 中心总数 -->
        <text x="100" y="94" text-anchor="middle" class="center-num">{{ total }}</text>
        <text x="100" y="116" text-anchor="middle" class="center-label">总计</text>
      </svg>

      <div class="legend">
        <div
          v-for="seg in segments"
          :key="seg.label"
          class="legend-item"
          @mouseenter="hoverLabel = seg.label"
          @mouseleave="hoverLabel = ''"
        >
          <span class="dot" :style="{ background: seg.color }"></span>
          <span class="legend-label">{{ seg.label }}</span>
          <span class="legend-value">{{ seg.value }}</span>
          <span class="legend-pct">{{ seg.pct }}%</span>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无数据" :image-size="64" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { categoryColor } from '@/components/schedule/categoryColor'

const props = defineProps({
  title: { type: String, default: '' },
  /** { 分类名: 数量 } */
  data: { type: Object, default: () => ({}) }
})

const R = 80
const C = 2 * Math.PI * R // 圆周长

const hoverLabel = ref('')

const total = computed(() => Object.values(props.data).reduce((a, b) => a + b, 0))

/** 各分段弧长与偏移（按数量降序） */
const segments = computed(() => {
  const entries = Object.entries(props.data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  let offset = 0
  return entries.map(([label, value]) => {
    const len = total.value ? (value / total.value) * C : 0
    const seg = {
      label,
      value,
      len,
      offset,
      color: categoryColor(label),
      pct: total.value ? Math.round((value / total.value) * 1000) / 10 : 0
    }
    offset += len
    return seg
  })
})
</script>

<style scoped>
.donut-chart { width: 100%; }
.chart-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
}
.donut-body {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}
.donut-svg {
  width: 160px;
  height: 160px;
  flex-shrink: 0;
}
.seg {
  cursor: pointer;
  transition: stroke-width 0.15s ease;
}
.center-num {
  font-size: 28px;
  font-weight: 700;
  fill: var(--pwb-text);
}
.center-label {
  font-size: 12px;
  fill: var(--pwb-text-secondary);
}
.legend {
  flex: 1;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: default;
}
.legend-item:hover { background: var(--pwb-bg-hover); }
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.legend-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legend-value { font-weight: 600; }
.legend-pct {
  color: var(--pwb-text-secondary);
  font-size: 12px;
  width: 48px;
  text-align: right;
}
</style>
