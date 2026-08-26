<!--
  柱状图（纯 SVG 自绘，带坐标轴与 hover 数值）
  - props.points: [{ date: 'YYYY-MM-DD', value: number }]（值单位：分钟）
-->
<template>
  <div class="column-chart">
    <div class="chart-title">{{ title }}</div>
    <div class="svg-wrap" ref="wrapRef">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="chart-svg"
        @mousemove="onHover"
        @mouseleave="hoverIdx = -1"
      >
        <!-- Y 轴网格线与刻度 -->
        <g v-for="t in yTicks" :key="t.v">
          <line :x1="PAD.l" :x2="W - PAD.r" :y1="t.y" :y2="t.y" class="grid-line" />
          <text :x="PAD.l - 8" :y="t.y + 4" text-anchor="end" class="tick-text">{{ t.label }}</text>
        </g>
        <!-- X 轴 -->
        <line :x1="PAD.l" :x2="W - PAD.r" :y1="H - PAD.b" :y2="H - PAD.b" class="axis-line" />
        <text
          v-for="(p, i) in points"
          v-show="showXLabel(i)"
          :key="p.date"
          :x="xCenter(i)"
          :y="H - PAD.b + 16"
          text-anchor="middle"
          class="tick-text"
        >{{ xLabel(p.date) }}</text>

        <!-- 柱子 -->
        <rect
          v-for="(p, i) in points"
          :key="`bar-${p.date}`"
          :x="xCenter(i) - barWidth / 2"
          :y="yPos(p.value)"
          :width="barWidth"
          :height="Math.max(H - PAD.b - yPos(p.value), 0)"
          :rx="2"
          :fill="color"
          :opacity="hoverIdx === i ? 1 : 0.75"
        />
      </svg>

      <!-- hover 数值浮层 -->
      <div v-if="hoverIdx >= 0" class="tooltip" :style="tooltipStyle">
        <div class="tip-date">{{ points[hoverIdx].date }}</div>
        <div class="tip-value">{{ fmtMinutes(points[hoverIdx].value) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { dayjs } from '@/utils/datetime'

const props = defineProps({
  title: { type: String, default: '' },
  points: { type: Array, default: () => [] }, // [{date, value(分钟)}]
  color: { type: String, default: '#67c23a' }
})

const W = 640
const H = 240
const PAD = { l: 40, r: 16, t: 16, b: 32 }

const wrapRef = ref(null)
const hoverIdx = ref(-1)

const maxVal = computed(() => Math.max(60, ...props.points.map(p => p.value))) // 至少 1 小时刻度

const slotWidth = computed(() => (W - PAD.l - PAD.r) / Math.max(1, props.points.length))
const barWidth = computed(() => Math.min(24, slotWidth.value * 0.6))

function xCenter(i) {
  return PAD.l + slotWidth.value * (i + 0.5)
}
function yPos(v) {
  return PAD.t + (1 - v / maxVal.value) * (H - PAD.t - PAD.b)
}

/** Y 轴 4 档刻度（按小时取整显示） */
const yTicks = computed(() => {
  const ticks = []
  for (let i = 0; i <= 4; i++) {
    const v = (maxVal.value / 4) * i
    ticks.push({ v, y: yPos(v), label: v >= 60 ? `${Math.round(v / 60 * 10) / 10}h` : `${Math.round(v)}m` })
  }
  return ticks
})

const labelStep = computed(() => Math.max(1, Math.ceil(props.points.length / 8)))
function showXLabel(i) {
  return i % labelStep.value === 0
}
function xLabel(date) {
  return dayjs(date).format('M/D')
}

function fmtMinutes(m) {
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const rest = m % 60
    return rest ? `${h} 小时 ${rest} 分钟` : `${h} 小时`
  }
  return `${m} 分钟`
}

function onHover(e) {
  if (!props.points.length || !wrapRef.value) return
  const rect = wrapRef.value.getBoundingClientRect()
  const svgX = ((e.clientX - rect.left) / rect.width) * W
  const idx = Math.floor((svgX - PAD.l) / slotWidth.value)
  hoverIdx.value = Math.max(0, Math.min(props.points.length - 1, idx))
}

const tooltipStyle = computed(() => {
  if (hoverIdx.value < 0 || !wrapRef.value) return {}
  const rect = wrapRef.value.getBoundingClientRect()
  const px = (xCenter(hoverIdx.value) / W) * rect.width
  const py = (yPos(props.points[hoverIdx.value].value) / H) * rect.height
  return {
    left: `${Math.min(px + 8, rect.width - 120)}px`,
    top: `${Math.max(py - 48, 0)}px`
  }
})
</script>

<style scoped>
.column-chart { width: 100%; }
.chart-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
}
.svg-wrap { position: relative; }
.chart-svg {
  width: 100%;
  height: auto;
  display: block;
}
.grid-line {
  stroke: var(--pwb-border);
  stroke-dasharray: 3 3;
}
.axis-line { stroke: var(--pwb-border); }
.tick-text {
  font-size: 11px;
  fill: var(--pwb-text-secondary);
}
.tooltip {
  position: absolute;
  pointer-events: none;
  background: var(--pwb-bg-card);
  border: 1px solid var(--pwb-border);
  border-radius: 4px;
  box-shadow: var(--pwb-shadow);
  padding: 4px 8px;
  font-size: 12px;
  white-space: nowrap;
  z-index: 5;
}
.tip-date { color: var(--pwb-text-secondary); }
.tip-value { font-weight: 600; }
</style>
