<!--
  日期计算器（PRD 3.5.2）
  - 两个日期之间的间隔天数（自然日）与工作日天数（workdaysBetween，周一至周五计工作日）
  - 基准日期 + N 天/周/月后的日期推算（dayjs add）
-->
<template>
  <div class="date-calc">
    <!-- 日期间隔 -->
    <div class="calc-block">
      <div class="block-title">日期间隔</div>
      <div class="date-row">
        <el-date-picker v-model="startDate" type="date" placeholder="开始日期" value-format="YYYY-MM-DD" style="flex: 1" />
        <span class="row-sep">至</span>
        <el-date-picker v-model="endDate" type="date" placeholder="结束日期" value-format="YYYY-MM-DD" style="flex: 1" />
      </div>
      <div v-if="intervalResult" class="calc-result">
        <div class="result-item">
          <span class="result-value">{{ intervalResult.days }}</span>
          <span class="result-label">间隔天数</span>
        </div>
        <div class="result-item">
          <span class="result-value">{{ intervalResult.workdays }}</span>
          <span class="result-label">工作日天数</span>
        </div>
      </div>
      <div v-else class="empty-hint">选择两个日期后自动计算</div>
    </div>

    <el-divider />

    <!-- 日期推算 -->
    <div class="calc-block">
      <div class="block-title">日期推算</div>
      <div class="date-row">
        <el-date-picker v-model="baseDate" type="date" placeholder="基准日期" value-format="YYYY-MM-DD" style="flex: 1" />
        <el-input-number v-model="offset" :min="-3650" :max="3650" size="default" style="width: 120px" />
        <el-select v-model="unit" style="width: 80px">
          <el-option label="天" value="day" />
          <el-option label="周" value="week" />
          <el-option label="月" value="month" />
        </el-select>
      </div>
      <div v-if="addResult" class="calc-result">
        <div class="result-item wide">
          <span class="result-value">{{ addResult.date }}</span>
          <span class="result-label">{{ addResult.weekday }}</span>
        </div>
      </div>
      <div v-else class="empty-hint">选择基准日期后自动推算</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { dayjs, workdaysBetween } from '@/utils/datetime'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/* ---------------- 日期间隔 ---------------- */
const startDate = ref('')
const endDate = ref('')

const intervalResult = computed(() => {
  if (!startDate.value || !endDate.value) return null
  const a = dayjs(startDate.value).startOf('day')
  const b = dayjs(endDate.value).startOf('day')
  return {
    // 自然日：取绝对值，正反向计算一致
    days: Math.abs(b.diff(a, 'day')),
    // 工作日：workdaysBetween 内部自动交换首尾
    workdays: workdaysBetween(startDate.value, endDate.value)
  }
})

/* ---------------- 日期推算 ---------------- */
const baseDate = ref('')
const offset = ref(7)
const unit = ref('day')

const addResult = computed(() => {
  if (!baseDate.value) return null
  const d = dayjs(baseDate.value).add(offset.value || 0, unit.value)
  return { date: d.format('YYYY-MM-DD'), weekday: WEEKDAYS[d.day()] }
})
</script>

<style scoped>
.date-calc { display: flex; flex-direction: column; gap: 8px; }
.block-title { font-weight: 600; font-size: 13px; color: var(--pwb-text-secondary); margin-bottom: 8px; }
.date-row { display: flex; align-items: center; gap: 8px; }
.row-sep { color: var(--pwb-text-secondary); font-size: 13px; }
.calc-result {
  display: flex;
  gap: 16px;
  margin-top: 16px;
}
.result-item {
  flex: 1;
  text-align: center;
  padding: 12px 8px;
  border-radius: var(--pwb-radius);
  background: var(--pwb-bg-hover);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.result-item.wide { flex: 1; }
.result-value { font-size: 22px; font-weight: 700; color: var(--pwb-primary); font-variant-numeric: tabular-nums; }
.result-label { font-size: 12px; color: var(--pwb-text-secondary); }
.empty-hint { margin-top: 8px; font-size: 12px; color: var(--pwb-text-secondary); }
</style>
