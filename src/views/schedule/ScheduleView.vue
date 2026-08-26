<!--
  日历页（PRD 3.2）
  - 顶部工具栏：日/周/月视图切换、今天、前后翻页、自然语言快速新增（解析预览）
  - 月视图：标准日历网格（MonthGrid），拖拽色条改期
  - 日/周视图：时间轴（TimeGrid），拖拽移动改时间、拉伸改时长
  - 重复日程实例的拖拽/修改统一走 scheduleStore.editInstance 生成例外
  - 所有变更接入全局撤销栈；保存/拖拽后自动冲突检测（仅提示，允许保存）
-->
<template>
  <div class="page-container schedule-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar pwb-card">
      <div class="toolbar-left">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="day">日</el-radio-button>
          <el-radio-button value="week">周</el-radio-button>
          <el-radio-button value="month">月</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="goToday">今天</el-button>
        <el-button-group>
          <el-button size="small" aria-label="上一页" @click="goPrev">
            <el-icon><ArrowLeft /></el-icon>
          </el-button>
          <el-button size="small" aria-label="下一页" @click="goNext">
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </el-button-group>
        <span class="range-label">{{ rangeLabel }}</span>
      </div>

      <div class="toolbar-right">
        <el-input
          v-model="quickText"
          size="small"
          class="quick-input"
          placeholder="快速新增：明天下午2点到3点 产品评审 会议室A"
          clearable
          @keyup.enter="submitQuick"
        >
          <template #append>
            <el-button @click="submitQuick">添加</el-button>
          </template>
        </el-input>
        <!-- 自然语言解析预览 -->
        <div v-if="quickPreview" class="parse-preview">
          <el-icon><MagicStick /></el-icon>
          <span>{{ quickPreview }}</span>
        </div>
      </div>
    </div>

    <!-- 日历主体 -->
    <div class="calendar-body pwb-card">
      <MonthGrid
        v-if="viewMode === 'month'"
        :cursor="cursor"
        :instances="instances"
        @open="onOpen"
        @move="onMonthMove"
        @create="onQuickCreate"
      />
      <TimeGrid
        v-else
        :days="viewDays"
        :instances="instances"
        @open="onOpen"
        @change="onTimeChange"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useScheduleStore, expandSchedules } from '@/stores/schedule'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { parseScheduleInput } from '@/utils/nlp'
import { findConflicts } from '@/utils/conflict'
import { dayjs, fmtDateTime } from '@/utils/datetime'
import MonthGrid from '@/components/schedule/MonthGrid.vue'
import TimeGrid from '@/components/schedule/TimeGrid.vue'

const scheduleStore = useScheduleStore()
const settingsStore = useSettingsStore()
const uiStore = useUiStore()
const undoStore = useUndoStore()

const viewMode = ref(window.matchMedia('(max-width: 640px)').matches ? 'day' : 'month')   // day | week | month
const cursor = ref(dayjs())     // 当前视图基准日期

/* ---------------- 视图区间与实例展开 ---------------- */

const rangeStart = computed(() => {
  if (viewMode.value === 'day') return cursor.value.startOf('day')
  if (viewMode.value === 'week') return cursor.value.startOf('isoWeek')
  // 月视图覆盖完整网格（含前后月补位）
  return cursor.value.startOf('month').startOf('isoWeek')
})

const rangeEnd = computed(() => {
  if (viewMode.value === 'day') return cursor.value.endOf('day')
  if (viewMode.value === 'week') return cursor.value.endOf('isoWeek')
  return rangeStart.value.add(41, 'day').endOf('day')
})

/** 当前区间内的日程实例（重复日程已展开，实例带 _master_id/_instance_date） */
const instances = computed(() =>
  expandSchedules(scheduleStore.schedules, rangeStart.value.toISOString(), rangeEnd.value.toISOString())
)

/** 日/周视图传给 TimeGrid 的日期列 */
const viewDays = computed(() => {
  if (viewMode.value === 'day') return [cursor.value.startOf('day')]
  const start = cursor.value.startOf('isoWeek')
  return Array.from({ length: 7 }, (_, i) => start.add(i, 'day'))
})

const rangeLabel = computed(() => {
  if (viewMode.value === 'day') {
    return cursor.value.format('YYYY年M月D日') + ` 周${'一二三四五六日'[cursor.value.isoWeekday() - 1]}`
  }
  if (viewMode.value === 'week') {
    const s = cursor.value.startOf('isoWeek')
    const e = cursor.value.endOf('isoWeek')
    return `${s.format('YYYY年M月D日')} - ${e.format('M月D日')}`
  }
  return cursor.value.format('YYYY年M月')
})

/* ---------------- 翻页导航 ---------------- */

function goPrev() {
  cursor.value = cursor.value.subtract(1, viewMode.value === 'month' ? 'month' : viewMode.value === 'week' ? 'week' : 'day')
}
function goNext() {
  cursor.value = cursor.value.add(1, viewMode.value === 'month' ? 'month' : viewMode.value === 'week' ? 'week' : 'day')
}
function goToday() {
  cursor.value = dayjs()
}

/* ---------------- 快速新增（自然语言解析） ---------------- */

const quickText = ref('')
const parsedQuick = computed(() => (quickText.value.trim() ? parseScheduleInput(quickText.value) : null))

/** 解析预览文案 */
const quickPreview = computed(() => {
  const p = parsedQuick.value
  if (!p) return ''
  const parts = []
  if (p.title) parts.push(`标题「${p.title}」`)
  if (p.start_time) parts.push(`时间 ${fmtDateTime(p.start_time)} ~ ${dayjs(p.end_time).format('HH:mm')}`)
  if (p.location) parts.push(`地点 ${p.location}`)
  return parts.length ? parts.join('，') : '未识别到有效信息'
})

async function submitQuick() {
  const p = parsedQuick.value
  if (!p || !p.title) {
    ElMessage.warning('请输入日程内容，如「明天下午2点到3点 产品评审 会议室A」')
    return
  }
  // 未解析出时间时，默认下一个整点开始、持续 1 小时
  let startISO = p.start_time
  let endISO = p.end_time
  if (!startISO) {
    const s = dayjs().add(1, 'hour').minute(0).second(0)
    startISO = s.toISOString()
    endISO = s.add(1, 'hour').toISOString()
  }
  const sch = await scheduleStore.addSchedule({
    title: p.title,
    start_time: startISO,
    end_time: endISO,
    location: p.location,
    remind_minutes: settingsStore.settings.defaultRemind
  })
  undoStore.push({
    label: `新建日程「${sch.title}」`,
    undo: async () => { await scheduleStore.deleteSchedule(sch.schedule_id) },
    redo: async () => { await scheduleStore.restoreSchedule(sch) }
  })
  quickText.value = ''
  // 跳到新增日程所在日期，便于用户看到结果
  cursor.value = dayjs(startISO)
  warnIfConflict(sch)
  ElMessage.success('日程已创建')
}

/* ---------------- 打开详情 ---------------- */

function onOpen(item) {
  // 重复日程实例打开主日程详情（编辑时可选「仅本次/全部」）
  uiStore.openDetail(
    'schedule',
    item._master_id || item.schedule_id,
    item._instance_date ? { instanceDate: item._instance_date } : null
  )
}

/* ---------------- 月视图：空白快速创建 & 拖拽改期 ---------------- */

/** 点击日期空白 → 预填当日 9:00-10:00 创建并打开详情 */
async function onQuickCreate(dateKeyStr) {
  const start = dayjs(dateKeyStr).hour(9).minute(0).second(0)
  const sch = await scheduleStore.addSchedule({
    title: '新建日程',
    start_time: start.toISOString(),
    end_time: start.add(1, 'hour').toISOString(),
    remind_minutes: settingsStore.settings.defaultRemind
  })
  undoStore.push({
    label: `新建日程「${sch.title}」`,
    undo: async () => { await scheduleStore.deleteSchedule(sch.schedule_id) },
    redo: async () => { await scheduleStore.restoreSchedule(sch) }
  })
  warnIfConflict(sch)
  uiStore.openDetail('schedule', sch.schedule_id)
}

/** 月视图拖拽色条到其他日期：保持时刻不变，平移日期 */
function onMonthMove({ item, dateKey: targetKey }) {
  const s = dayjs(item.start_time)
  const e = dayjs(item.end_time)
  const dayDiff = dayjs(targetKey).startOf('day').diff(s.startOf('day'), 'day')
  if (dayDiff === 0) return
  applyTimeChange(item, s.add(dayDiff, 'day').toISOString(), e.add(dayDiff, 'day').toISOString())
}

/** 日/周视图拖拽移动或拉伸 */
function onTimeChange({ item, startISO, endISO }) {
  applyTimeChange(item, startISO, endISO)
}

/**
 * 统一的时间变更入口：
 * - 重复日程实例 → editInstance 生成「仅本次」例外
 * - 普通日程/例外记录 → updateSchedule
 * 两种情况都接入撤销栈
 */
async function applyTimeChange(item, startISO, endISO) {
  const patch = { start_time: startISO, end_time: endISO }
  if (item._master_id) {
    // 重复日程实例：生成例外记录
    const inst = await scheduleStore.editInstance(item._master_id, item._instance_date, patch)
    if (!inst) return
    undoStore.push({
      label: `调整日程「${item.title}」（仅本次）`,
      undo: async () => { await scheduleStore.deleteSchedule(inst.schedule_id) },
      redo: async () => { await scheduleStore.restoreSchedule(inst) }
    })
  } else {
    const res = await scheduleStore.updateSchedule(item.schedule_id, patch)
    if (!res) return
    const { before } = res
    undoStore.push({
      label: `调整日程「${item.title}」`,
      undo: async () => { await scheduleStore.updateSchedule(item.schedule_id, { start_time: before.start_time, end_time: before.end_time }) },
      redo: async () => { await scheduleStore.updateSchedule(item.schedule_id, patch) }
    })
  }
  warnIfConflict({ ...item, ...patch })
  ElMessage.success('日程时间已更新')
}

/* ---------------- 冲突检测（高亮提示，允许保存） ---------------- */

/** 检测目标日程与周边日程的时间重叠并提示 */
function warnIfConflict(target) {
  if (!target.start_time || !target.end_time) return
  // 展开目标前后各一天作为候选（覆盖跨天情况）
  const candidates = expandSchedules(
    scheduleStore.schedules,
    dayjs(target.start_time).subtract(1, 'day').toISOString(),
    dayjs(target.end_time).add(1, 'day').toISOString()
  ).filter(s =>
    // 排除自身（普通日程按 id；重复日程实例按主 id，避免与自身其他实例误报由 findConflicts 按 id 排除即可，这里再排除同主实例）
    s.schedule_id !== target.schedule_id && s._master_id !== target.schedule_id &&
    s.schedule_id !== target._master_id
  )
  const conflicts = findConflicts(target, candidates)
  if (conflicts.length) {
    const names = conflicts.slice(0, 3).map(c => `「${c.title}」${fmtDateTime(c.start_time)}`).join('、')
    ElMessage.warning(`与 ${conflicts.length} 个日程时间冲突：${names}${conflicts.length > 3 ? ' 等' : ''}`)
  }
}
</script>

<style scoped>
.schedule-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.range-label {
  font-size: 15px;
  font-weight: 600;
  margin-left: 8px;
  white-space: nowrap;
}
.toolbar-right {
  position: relative;
  min-width: 320px;
  flex: 1;
  max-width: 480px;
}
.quick-input { width: 100%; }
.parse-preview {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--pwb-bg-card);
  border: 1px solid var(--pwb-border);
  border-radius: var(--pwb-radius);
  box-shadow: var(--pwb-shadow);
  padding: 4px 8px;
  font-size: 12px;
  color: var(--pwb-text-secondary);
  max-width: 100%;
}
.calendar-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0;
}
.calendar-body > * {
  flex: 1;
  min-height: 0;
}
</style>
