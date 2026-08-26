<!--
  横向条形图（纯 CSS/div 自绘）
  - 用于四象限分布；四象限标签使用对应象限色，其他标签走分类色板
-->
<template>
  <div class="hbar-chart">
    <div class="chart-title">{{ title }}</div>
    <div v-if="entries.length" class="bars">
      <div v-for="e in entries" :key="e.label" class="bar-row" :title="`${e.label}：${e.value}`">
        <span class="bar-label">{{ e.label }}</span>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: e.pct + '%', background: e.color }"></div>
        </div>
        <span class="bar-value">{{ e.value }}</span>
      </div>
    </div>
    <el-empty v-else description="暂无数据" :image-size="64" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { categoryColor } from '@/components/schedule/categoryColor'

const props = defineProps({
  title: { type: String, default: '' },
  /** { 标签: 数量 }，渲染顺序按给定对象的键顺序 */
  data: { type: Object, default: () => ({}) }
})

/** 四象限标签使用对应象限色 */
const QUADRANT_COLORS = { 重要紧急: '#f56c6c', 重要不紧急: '#e6a23c', 不重要紧急: '#3b6fe0', 不重要不紧急: '#909399' }

const entries = computed(() => {
  const list = Object.entries(props.data)
  const max = Math.max(1, ...list.map(([, v]) => v))
  return list.map(([label, value]) => ({
    label,
    value,
    pct: Math.round((value / max) * 100),
    color: QUADRANT_COLORS[label] || categoryColor(label)
  }))
})
</script>

<style scoped>
.hbar-chart { width: 100%; }
.chart-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
}
.bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.bar-label {
  width: 56px;
  flex-shrink: 0;
  color: var(--pwb-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-track {
  flex: 1;
  height: 16px;
  background: var(--pwb-bg-hover);
  border-radius: 4px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 4px;
  min-width: 2px;
  transition: width 0.3s ease;
}
.bar-value {
  width: 40px;
  text-align: right;
  font-weight: 600;
  flex-shrink: 0;
}
</style>
