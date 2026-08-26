<!--
  折线图（纯 SVG 自绘，带坐标轴与 hover 数值）
  - props.points: [{ date: 'YYYY-MM-DD', value: number }]
-->
<template>
  <div class="line-chart">
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
          <text :x="PAD.l - 8" :y="t.y + 4" text-anchor="end" class="tick-text">{{ t.v }}</text>
        </g>
        <!-- X 轴 -->
        <line :x1="PAD.l" :x2="W - PAD.r" :y1="H - PAD.b" :y2="H - PAD.b" class="axis-line" />
        <text
          v-for="(p, i) in points"
          v-show="showXLabel(i)"
          :key="p.date"
          :x="xPos(i)"
          :y="H - PAD.b + 16"
          text-anchor="middle"
          class="tick-text"
        >{{ xLabel(p.date) }}</text>

        <!-- 折线与数据点 -->
        <polyline v-if="points.length" :points="polyPoints" fill="none" :stroke="color" stroke-width="2" />
        <circle
          v-for="(p, i) in points"
          :key="`pt-${p.date}`"
          :cx="xPos(i)"
          :cy="yPos(p.value)"
          :r="hoverIdx === i ? 5 : 3"
          :fill="color"
        />

        <!-- hover 竖直参考线 -->
        <line
          v-if="hoverIdx >= 0"
          :x1="xPos(hoverIdx)"
          :x2="xPos(hoverIdx)"
          :y1="PAD.t"
          :y2="H - PAD.b"
          class="hover-line"
        />
      </svg>

      <!-- hover 数值浮层 -->
      <div v-if="hoverIdx >= 0" class="tooltip" :style="tooltipStyle">
        <div class="tip-date">{{ points[hoverIdx].date }}</div>
        <div class="tip-value">{{ points[hoverIdx].value }} {{ unit }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { dayjs } from '@/utils/datetime'

const props = defineProps({
  title: { type: String, default: '' },
  points: { type: Array, default: () => [] }, // [{date, value}]
  color: { type: String, default: '#3b6fe0' },
  unit: { type: String, default: '' }
})

const W = 640
const H = 240
const PAD = { l: 40, r: 16, t: 16, b: 32 }

const wrapRef = ref(null)
const hoverIdx = ref(-1)

const maxVal = computed(() => Math.max(1, ...props.points.map(p => p.value)))

function xPos(i) {
  const n = Math.max(1, props.points.length - 1)
  return PAD.l + (i / n) * (W - PAD.l - PAD.r)
}
function yPos(v) {
  return PAD.t + (1 - v / maxVal.value) * (H - PAD.t - PAD.b)
}

/** Y 轴 4 档刻度 */
const yTicks = computed(() => {
  const ticks = []
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((maxVal.value / 4) * i * 10) / 10
    ticks.push({ v, y: yPos(v) })
  }
  return ticks
})

const polyPoints = computed(() =>
  props.points.map((p, i) => `${xPos(i)},${yPos(p.value)}`).join(' ')
)

/** X 轴标签稀疏化：最多约 8 个 */
const labelStep = computed(() => Math.max(1, Math.ceil(props.points.length / 8)))
function showXLabel(i) {
  return i % labelStep.value === 0
}
function xLabel(date) {
  return dayjs(date).format('M/D')
}

/** hover：按鼠标位置找最近数据点 */
function onHover(e) {
  if (!props.points.length || !wrapRef.value) return
  const rect = wrapRef.value.getBoundingClientRect()
  const svgX = ((e.clientX - rect.left) / rect.width) * W
  let best = 0
  let bestDist = Infinity
  props.points.forEach((_, i) => {
    const d = Math.abs(xPos(i) - svgX)
    if (d < bestDist) { bestDist = d; best = i }
  })
  hoverIdx.value = best
}

const tooltipStyle = computed(() => {
  if (hoverIdx.value < 0 || !wrapRef.value) return {}
  const rect = wrapRef.value.getBoundingClientRect()
  const px = (xPos(hoverIdx.value) / W) * rect.width
  const py = (yPos(props.points[hoverIdx.value].value) / H) * rect.height
  return {
    left: `${Math.min(px + 8, rect.width - 96)}px`,
    top: `${Math.max(py - 48, 0)}px`
  }
})
</script>

<style scoped>
.line-chart { width: 100%; }
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
.hover-line {
  stroke: var(--pwb-text-secondary);
  stroke-dasharray: 3 3;
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
