<!--
  周期复盘报告（PRD 3.4.3）
  - 周报/月报切换，调 stats.js 的 generateReview 生成
  - 4 个固定模块：数据概览（含环比箭头）/ 亮点总结 / 问题分析（关键词标签云）/ 行动建议
  - 支持导出为 Markdown
-->
<template>
  <div class="review-panel">
    <div class="review-header">
      <div class="chart-title">周期复盘报告</div>
      <div class="review-actions">
        <el-radio-group v-model="periodType" size="small">
          <el-radio-button value="week">周报</el-radio-button>
          <el-radio-button value="month">月报</el-radio-button>
        </el-radio-group>
        <el-button size="small" type="primary" plain @click="exportMarkdown">
          <el-icon><Download /></el-icon>&nbsp;导出 Markdown
        </el-button>
      </div>
    </div>

    <div class="review-range">{{ rangeText }}</div>

    <!-- 模块一：数据概览（含环比变化箭头） -->
    <div class="review-section">
      <div class="section-title">一、数据概览</div>
      <div class="overview-cards">
        <div class="ov-card">
          <div class="ov-label">任务完成率</div>
          <div class="ov-value">{{ review.overview.completionRate }}%</div>
          <DeltaArrow :delta="review.overview.completionRateDelta" suffix="pct" />
        </div>
        <div class="ov-card">
          <div class="ov-label">完成任务</div>
          <div class="ov-value">{{ review.overview.done }}</div>
          <DeltaArrow :delta="review.overview.doneDelta" />
        </div>
        <div class="ov-card">
          <div class="ov-label">延期任务</div>
          <div class="ov-value">{{ review.overview.delayed }}</div>
          <div class="ov-sub">延期率 {{ review.overview.delayRate }}%</div>
        </div>
        <div class="ov-card">
          <div class="ov-label">日程总数</div>
          <div class="ov-value">{{ review.overview.scheduleTotal }}</div>
          <div class="ov-sub">总时长 {{ fmtMinutes(review.overview.scheduleMinutes) }}</div>
        </div>
      </div>
    </div>

    <!-- 模块二：亮点总结 -->
    <div class="review-section">
      <div class="section-title">二、亮点总结</div>
      <div v-if="hasHighlights" class="section-body">
        <div v-if="review.highlights.bestCategory" class="hl-line">
          完成数最多的分类：
          <el-tag size="small" type="success">{{ review.highlights.bestCategory[0] }}</el-tag>
          <span class="hl-sub">（{{ review.highlights.bestCategory[1] }} 个任务）</span>
        </div>
        <div v-if="review.highlights.highPriorityDone.length" class="hl-line">
          <div class="hl-label">完成的重要任务：</div>
          <div
            v-for="t in review.highlights.highPriorityDone.slice(0, 8)"
            :key="t.task_id"
            class="hl-task"
          >
            <QuadrantTag :task="t" />
            <span>{{ t.title }}</span>
          </div>
        </div>
      </div>
      <el-empty v-else description="本周期暂无亮点数据" :image-size="56" />
    </div>

    <!-- 模块三：问题分析（关键词标签云） -->
    <div class="review-section">
      <div class="section-title">三、问题分析</div>
      <div v-if="review.problems.delayedCount > 0" class="section-body">
        <div class="hl-line">
          延期任务 {{ review.problems.delayedCount }} 个
          <template v-if="review.problems.worstCategory">
            ，集中在分类
            <el-tag size="small" type="danger">{{ review.problems.worstCategory[0] }}</el-tag>
            <span class="hl-sub">（{{ review.problems.worstCategory[1] }} 个）</span>
          </template>
        </div>
        <div v-if="review.problems.keywords.length" class="keyword-cloud">
          <span class="hl-label">延期任务高频关键词：</span>
          <span
            v-for="(kw, i) in review.problems.keywords"
            :key="kw"
            class="keyword"
            :style="{ fontSize: keywordSize(i) + 'px' }"
          >{{ kw }}</span>
        </div>
      </div>
      <el-empty v-else description="本周期没有延期任务，继续保持" :image-size="56" />
    </div>

    <!-- 模块四：行动建议（编号列表） -->
    <div class="review-section">
      <div class="section-title">四、行动建议</div>
      <ol class="suggestion-list">
        <li v-for="(s, i) in review.suggestions" :key="i">{{ s }}</li>
      </ol>
    </div>
  </div>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useTaskStore } from '@/stores/task'
import { useScheduleStore, expandSchedules } from '@/stores/schedule'
import { generateReview } from '@/utils/stats'
import { downloadMarkdown } from '@/utils/exporter'
import { dayjs, weekRange, monthRange, fmtDate, dateKey } from '@/utils/datetime'
import QuadrantTag from '@/components/tasks/QuadrantTag.vue'

const taskStore = useTaskStore()
const scheduleStore = useScheduleStore()

const periodType = ref('week') // week | month

/** 本期与上一期的时间区间 */
const ranges = computed(() => {
  if (periodType.value === 'week') {
    const [start, end] = weekRange()
    const [prevStart, prevEnd] = weekRange(dayjs().subtract(1, 'week'))
    return { start, end, prevStart, prevEnd }
  }
  const [start, end] = monthRange()
  const [prevStart, prevEnd] = monthRange(dayjs().subtract(1, 'month'))
  return { start, end, prevStart, prevEnd }
})

const rangeText = computed(() =>
  `${periodType.value === 'week' ? '本周' : '本月'}：${fmtDate(ranges.value.start)} ~ ${fmtDate(ranges.value.end)}`
)

/** 复盘数据（日程先按区间展开，重复日程实例计入统计） */
const review = computed(() => {
  const { start, end, prevStart, prevEnd } = ranges.value
  const expanded = expandSchedules(scheduleStore.schedules, prevStart, end)
  return generateReview(periodType.value, taskStore.tasks, expanded, start, end, prevStart, prevEnd)
})

const hasHighlights = computed(() =>
  !!review.value.highlights.bestCategory || review.value.highlights.highPriorityDone.length > 0
)

/** 关键词标签云：越靠前字号越大 */
function keywordSize(index) {
  return Math.max(12, 22 - index * 2)
}

function fmtMinutes(m) {
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const rest = m % 60
    return rest ? `${h} 小时 ${rest} 分钟` : `${h} 小时`
  }
  return `${m} 分钟`
}

/** 环比变化箭头（内联小组件）：上升绿色 ▲，下降红色 ▼，持平灰色 — */
const DeltaArrow = (props) => {
  const { delta } = props
  if (!delta) return h('span', { class: 'delta flat' }, '— 持平')
  const up = delta > 0
  return h('span', { class: `delta ${up ? 'up' : 'down'}` }, `${up ? '▲' : '▼'} ${Math.abs(delta)}${props.suffix === 'pct' ? ' pct' : ''} 环比`)
}
DeltaArrow.props = { delta: { type: Number, default: 0 }, suffix: { type: String, default: '' } }

/** 导出复盘报告为 Markdown */
function exportMarkdown() {
  const r = review.value
  const { start, end } = ranges.value
  const title = periodType.value === 'week' ? '周报' : '月报'
  const deltaText = (d, suffix = '') => (d > 0 ? `+${d}${suffix}` : `${d}${suffix}`)
  const lines = [
    `# 个人周期复盘报告（${title}）`,
    '',
    `> 统计区间：${fmtDate(start)} ~ ${fmtDate(end)}　生成时间：${dayjs().format('YYYY-MM-DD HH:mm')}`,
    '',
    '## 一、数据概览',
    '',
    '| 指标 | 本期 | 环比 |',
    '| --- | --- | --- |',
    `| 任务完成率 | ${r.overview.completionRate}% | ${deltaText(r.overview.completionRateDelta, ' pct')} |`,
    `| 完成任务数 | ${r.overview.done} | ${deltaText(r.overview.doneDelta)} |`,
    `| 延期任务数 | ${r.overview.delayed}（延期率 ${r.overview.delayRate}%） | - |`,
    `| 日程总数 | ${r.overview.scheduleTotal}（总时长 ${fmtMinutes(r.overview.scheduleMinutes)}） | - |`,
    '',
    '## 二、亮点总结',
    '',
    r.highlights.bestCategory
      ? `- 完成数最多的分类：**${r.highlights.bestCategory[0]}**（${r.highlights.bestCategory[1]} 个任务）`
      : '- 本周期暂无完成任务分类数据',
    ...(r.highlights.highPriorityDone.length
      ? ['- 完成的重要任务：', ...r.highlights.highPriorityDone.map(t => `  - ${t.title}`)]
      : ['- 本周期暂无完成的高优先级任务']),
    '',
    '## 三、问题分析',
    '',
    r.problems.delayedCount > 0
      ? `- 延期任务 ${r.problems.delayedCount} 个${r.problems.worstCategory ? `，集中在分类 **${r.problems.worstCategory[0]}**（${r.problems.worstCategory[1]} 个）` : ''}`
      : '- 本周期没有延期任务',
    r.problems.keywords.length ? `- 高频关键词：${r.problems.keywords.join('、')}` : '',
    '',
    '## 四、行动建议',
    '',
    ...r.suggestions.map((s, i) => `${i + 1}. ${s}`),
    ''
  ]
  downloadMarkdown(lines.filter(x => x !== undefined).join('\n'), `复盘报告_${title}_${dateKey(start)}_${dateKey(end)}.md`)
  ElMessage.success('复盘报告已导出')
}
</script>

<style scoped>
.review-panel { width: 100%; }
.review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.chart-title {
  font-size: 14px;
  font-weight: 600;
}
.review-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.review-range {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  margin: 8px 0 16px;
}
.review-section {
  border-top: 1px solid var(--pwb-border);
  padding: 16px 0;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
}
.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
}
.ov-card {
  background: var(--pwb-bg-hover);
  border-radius: var(--pwb-radius);
  padding: 16px;
}
.ov-label {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  margin-bottom: 8px;
}
.ov-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}
.ov-sub {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  margin-top: 4px;
}
:deep(.delta) { font-size: 12px; margin-top: 4px; display: inline-block; }
:deep(.delta.up) { color: #67c23a; }
:deep(.delta.down) { color: #f56c6c; }
:deep(.delta.flat) { color: var(--pwb-text-secondary); }
.section-body { font-size: 13px; }
.hl-line { margin-bottom: 8px; line-height: 1.8; }
.hl-label { color: var(--pwb-text-secondary); }
.hl-sub { color: var(--pwb-text-secondary); font-size: 12px; }
.hl-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.keyword-cloud {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.keyword {
  color: var(--pwb-primary);
  font-weight: 600;
  background: var(--pwb-bg-hover);
  border-radius: 4px;
  padding: 2px 8px;
}
.suggestion-list {
  margin: 0;
  padding-left: 24px;
  font-size: 13px;
  line-height: 2;
}
</style>
