<!--
  效率统计看板（PRD 3.4.2 + 3.4.3）
  - 周期切换：本周 / 本月 / 自定义日期范围
  - 任务维度：总数/完成数/完成率/延期率/取消率大数字卡 + 优先级分布横向条形图 + 分类占比环形图
  - 日程维度：总数/总时长/平均时长 + 分类占比环形图（重复日程按实例展开统计）
  - 时间分布：每日任务完成数折线图 + 每日日程时长柱状图（纯 SVG 自绘）
  - 下方为周期复盘报告（ReviewPanel）
-->
<template>
  <div class="page-container stats-page">
    <div class="stats-header">
      <h2 class="page-title">效率统计</h2>
      <div class="period-bar">
        <el-radio-group v-model="periodType" size="small">
          <el-radio-button value="week">本周</el-radio-button>
          <el-radio-button value="month">本月</el-radio-button>
          <el-radio-button value="custom">自定义</el-radio-button>
        </el-radio-group>
        <el-date-picker
          v-if="periodType === 'custom'"
          v-model="customRange"
          type="daterange"
          size="small"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        />
        <span class="range-text">{{ rangeText }}</span>
      </div>
    </div>

    <!-- 任务维度 -->
    <div class="pwb-card section">
      <div class="section-title">任务维度</div>
      <div class="num-cards">
        <div class="num-card">
          <div class="num-value">{{ taskStats.total }}</div>
          <div class="num-label">任务总数</div>
        </div>
        <div class="num-card">
          <div class="num-value done">{{ taskStats.done }}</div>
          <div class="num-label">完成数</div>
        </div>
        <div class="num-card">
          <div class="num-value primary">{{ taskStats.completionRate }}%</div>
          <div class="num-label">完成率</div>
        </div>
        <div class="num-card">
          <div class="num-value warn">{{ taskStats.delayRate }}%</div>
          <div class="num-label">延期率（{{ taskStats.delayed }} 个）</div>
        </div>
        <div class="num-card">
          <div class="num-value muted">{{ taskStats.cancelRate }}%</div>
          <div class="num-label">取消率（{{ taskStats.canceled }} 个）</div>
        </div>
      </div>
      <div class="chart-row">
        <div class="chart-half">
          <HBarChart title="四象限分布" :data="taskStats.quadrantDist" />
        </div>
        <div class="chart-half">
          <DonutChart title="任务分类占比" :data="taskStats.categoryDist" />
        </div>
      </div>
    </div>

    <!-- 日程维度 -->
    <div class="pwb-card section">
      <div class="section-title">日程维度</div>
      <div class="num-cards">
        <div class="num-card">
          <div class="num-value">{{ scheduleStats.total }}</div>
          <div class="num-label">日程总数</div>
        </div>
        <div class="num-card">
          <div class="num-value primary">{{ fmtMinutes(scheduleStats.totalMinutes) }}</div>
          <div class="num-label">总时长</div>
        </div>
        <div class="num-card">
          <div class="num-value">{{ fmtMinutes(scheduleStats.avgMinutes) }}</div>
          <div class="num-label">平均时长</div>
        </div>
      </div>
      <div class="chart-row">
        <div class="chart-half">
          <DonutChart title="日程分类占比" :data="scheduleStats.categoryDist" />
        </div>
        <div class="chart-half"></div>
      </div>
    </div>

    <!-- 时间分布 -->
    <div class="pwb-card section">
      <div class="section-title">时间分布</div>
      <div class="chart-row">
        <div class="chart-half">
          <LineChart title="每日任务完成数" :points="taskTrend" color="#3b6fe0" unit="个" />
        </div>
        <div class="chart-half">
          <ColumnChart title="每日日程时长" :points="scheduleTrend" color="#67c23a" />
        </div>
      </div>
    </div>

    <!-- 周期复盘报告 -->
    <div class="pwb-card section">
      <ReviewPanel />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useTaskStore } from '@/stores/task'
import { useScheduleStore, expandSchedules } from '@/stores/schedule'
import {
  computeTaskStats,
  computeScheduleStats,
  dailyTaskTrend,
  dailyScheduleTrend
} from '@/utils/stats'
import { dayjs, weekRange, monthRange, fmtDate } from '@/utils/datetime'
import HBarChart from '@/components/stats/HBarChart.vue'
import DonutChart from '@/components/stats/DonutChart.vue'
import LineChart from '@/components/stats/LineChart.vue'
import ColumnChart from '@/components/stats/ColumnChart.vue'
import ReviewPanel from '@/components/stats/ReviewPanel.vue'

const taskStore = useTaskStore()
const scheduleStore = useScheduleStore()

const periodType = ref('week') // week | month | custom
// 自定义范围默认最近 7 天
const customRange = ref([dayjs().subtract(6, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')])

/** 统计区间 [startISO, endISO] */
const range = computed(() => {
  if (periodType.value === 'week') return weekRange()
  if (periodType.value === 'month') return monthRange()
  const [s, e] = customRange.value || []
  if (!s || !e) return weekRange()
  return [dayjs(s).startOf('day').toISOString(), dayjs(e).endOf('day').toISOString()]
})

const rangeText = computed(() => `${fmtDate(range.value[0])} ~ ${fmtDate(range.value[1])}`)

/** 日程实例（重复日程展开后计入统计） */
const scheduleInstances = computed(() =>
  expandSchedules(scheduleStore.schedules, range.value[0], range.value[1])
)

const taskStats = computed(() => computeTaskStats(taskStore.tasks, range.value[0], range.value[1]))
const scheduleStats = computed(() => computeScheduleStats(scheduleInstances.value, range.value[0], range.value[1]))

const taskTrend = computed(() =>
  dailyTaskTrend(taskStore.tasks, range.value[0], range.value[1]).map(d => ({ date: d.date, value: d.count }))
)
const scheduleTrend = computed(() =>
  dailyScheduleTrend(scheduleInstances.value, range.value[0], range.value[1]).map(d => ({ date: d.date, value: d.minutes }))
)

function fmtMinutes(m) {
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const rest = m % 60
    return rest ? `${h}h${rest}m` : `${h}h`
  }
  return `${m}m`
}
</script>

<style scoped>
.stats-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.stats-header .page-title { margin: 0; }
.period-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.range-text {
  font-size: 12px;
  color: var(--pwb-text-secondary);
}
.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}
.num-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.num-card {
  background: var(--pwb-bg-hover);
  border-radius: var(--pwb-radius);
  padding: 16px;
  text-align: center;
}
.num-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}
.num-value.done { color: #67c23a; }
.num-value.primary { color: var(--pwb-primary); }
.num-value.warn { color: #e6a23c; }
.num-value.muted { color: var(--pwb-text-secondary); }
.num-label {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  margin-top: 8px;
}
.chart-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
@media (max-width: 1100px) {
  .chart-row { grid-template-columns: 1fr; }
}
.chart-half { min-width: 0; }
</style>
