<template>
  <div class="gantt-chart">
    <!-- 工具栏 -->
    <div class="gantt-toolbar">
      <span class="gantt-title">任务时间轴（拖拽条可改期）</span>
      <el-radio-group v-model="rangeDays" size="small">
        <el-radio-button :value="7">7 天</el-radio-button>
        <el-radio-button :value="14">14 天</el-radio-button>
        <el-radio-button :value="30">30 天</el-radio-button>
        <el-radio-button :value="90">90 天</el-radio-button>
      </el-radio-group>
      <span v-if="noDeadlineCount > 0" class="gantt-hint">
        {{ noDeadlineCount }} 个无截止时间的任务未显示
      </span>
      <div class="gantt-legend">
        <span class="legend-item"><i class="dot bar-todo"></i>待开始</span>
        <span class="legend-item"><i class="dot bar-doing"></i>进行中</span>
        <span class="legend-item"><i class="dot bar-delayed"></i>已延期</span>
        <span class="legend-item"><i class="dot bar-done"></i>已完成</span>
        <span class="legend-item"><i class="dot bar-canceled"></i>已取消</span>
      </div>
    </div>

    <!-- 甘特主体 -->
    <div class="gantt-body">
      <div class="gantt-labels">
        <div class="gantt-label-head">任务</div>
        <div
          v-for="t in ganttTasks" :key="taskKey(t)"
          class="gantt-label" :title="t.title"
          @click="openDetail(t)"
        >
          <QuadrantTag :task="t" />
          <span class="label-title" :class="{ strike: t.status === 'done' }">{{ t.title }}</span>
        </div>
        <div v-if="ganttTasks.length === 0" class="gantt-empty-label">暂无带截止时间的任务</div>
      </div>

      <div class="gantt-scroll" ref="scrollEl">
        <div class="gantt-timeline" :style="{ width: timelineWidth + 'px' }">
          <div class="gantt-head-row">
            <div
              v-for="d in days" :key="d.key"
              class="gantt-head-cell"
              :class="{ weekend: d.isWeekend, today: d.isToday }"
              :style="{ width: colW + 'px' }"
            >
              <div class="head-weekday">{{ d.weekday }}</div>
              <div class="head-day">{{ d.day }}</div>
            </div>
          </div>

          <div v-for="t in ganttTasks" :key="taskKey(t)" class="gantt-row" :style="{ width: timelineWidth + 'px' }">
            <div
              v-for="d in days" :key="d.key"
              class="gantt-cell"
              :class="{ weekend: d.isWeekend, today: d.isToday }"
              :style="{ width: colW + 'px' }"
            ></div>
            <div
              class="gantt-bar" :class="[`bar-${t.status}`, { dragging: isDragging(t) }]"
              :style="barStyle(t)"
              @mousedown.prevent="startDrag(t, $event)"
              @click.stop="openDetail(t)"
            >
              <span v-if="barWidthPx(t) > 56" class="bar-text">{{ t.title }}</span>
            </div>
          </div>

          <div class="today-line" :style="{ left: todayLeft + 'px' }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useTaskStore } from '@/stores/task'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { dayjs } from '@/utils/datetime'
import QuadrantTag from '@/components/tasks/QuadrantTag.vue'

const props = defineProps({ tasks: { type: Array, default: () => [] } })

const taskStore = useTaskStore()
const uiStore = useUiStore()
const undoStore = useUndoStore()
const rangeDays = ref(14)
const colW = 40
const scrollEl = ref(null)

const rangeStart = computed(() => dayjs().startOf('day').subtract(1, 'day'))
const rangeEnd = computed(() => dayjs().startOf('day').add(rangeDays.value, 'day'))

const days = computed(() => {
  const list = []
  let d = rangeStart.value
  const weekday = ['日', '一', '二', '三', '四', '五', '六']
  while (!d.isAfter(rangeEnd.value)) {
    const dow = d.day()
    list.push({
      key: d.format('YYYY-MM-DD'),
      day: d.date(),
      weekday: weekday[dow],
      isWeekend: dow === 0 || dow === 6,
      isToday: d.isSame(dayjs(), 'day')
    })
    d = d.add(1, 'day')
  }
  return list
})

const timelineWidth = computed(() => days.value.length * colW)
const todayLeft = computed(() => dayjs().startOf('day').diff(rangeStart.value, 'day') * colW + colW / 2)

const ganttTasks = computed(() => {
  return props.tasks
    .filter(t => t.deadline)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1))
})

const noDeadlineCount = computed(() => props.tasks.length - ganttTasks.value.length)

function taskKey(task) {
  return task._instance_date ? `${task.task_id}_${task._instance_date}` : task.task_id
}

function openDetail(task) {
  uiStore.openDetail('task', task._master_id || task.task_id)
}

/* ---- 条位置：从 start_time（缺省取 deadline 当天）到 deadline ---- */
function barStartDay(task) {
  let s = task.start_time ? dayjs(task.start_time) : dayjs(task.deadline).startOf('day')
  const d = dayjs(task.deadline)
  if (s.isAfter(d)) s = d.startOf('day')
  const clamped = s.isBefore(rangeStart.value) ? rangeStart.value : s
  return Math.max(0, clamped.diff(rangeStart.value, 'day'))
}

function barEndDay(task) {
  const dl = dragging.value?.task?.task_id === task.task_id && dragging.value?.previewDeadline
    ? dragging.value.previewDeadline : task.deadline
  return Math.min(days.value.length - 1, Math.max(barStartDay(task), dayjs(dl).startOf('day').diff(rangeStart.value, 'day')))
}

function barStyle(task) {
  const start = barStartDay(task)
  const end = barEndDay(task)
  const left = start * colW + 2
  const width = Math.max((end - start) * colW + colW - 4, 10)
  return { left: left + 'px', width: width + 'px' }
}

function barWidthPx(task) {
  const start = barStartDay(task)
  const end = barEndDay(task)
  return Math.max((end - start) * colW + colW - 4, 10)
}

/* ---- 拖拽排期 ---- */
const dragging = ref(null) // { task, offset, previewDeadline, previewStart }

function isDragging(task) {
  return dragging.value && dragging.value.task.task_id === task.task_id
}

function startDrag(task, e) {
  e.preventDefault()
  const el = scrollEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const clickX = e.clientX - rect.left + el.scrollLeft
  const dayIndex = Math.floor(clickX / colW)
  const deadlineDay = dayjs(task.deadline).startOf('day').diff(rangeStart.value, 'day')
  dragging.value = { task, offset: dayIndex - deadlineDay, previewDeadline: null, previewStart: null }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', endDrag)
}

function onDragMove(e) {
  const d = dragging.value
  const el = scrollEl.value
  if (!d || !el) return
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left + el.scrollLeft
  const dayIndex = Math.floor(x / colW)
  const targetDay = dayIndex - d.offset
  const newDeadline = rangeStart.value.add(targetDay, 'day').hour(18).minute(0).second(0)
  let newStart = null
  if (d.task.start_time) {
    const dur = dayjs(d.task.deadline).diff(dayjs(d.task.start_time))
    newStart = newDeadline.subtract(dur, 'millisecond')
  }
  d.previewDeadline = newDeadline.toISOString()
  d.previewStart = newStart ? newStart.toISOString() : null
}

function endDrag() {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', endDrag)
  const d = dragging.value
  dragging.value = null
  if (d && d.previewDeadline) {
    commitDrag(d.task, d.previewDeadline, d.previewStart)
  }
}

async function commitDrag(task, newDeadline, newStart) {
  const targetId = task._master_id || task.task_id
  const before = JSON.parse(JSON.stringify(taskStore.byId(targetId)))
  const patch = { deadline: newDeadline }
  if (newStart !== undefined && task.start_time) patch.start_time = newStart
  await taskStore.updateTask(targetId, patch)
  const after = JSON.parse(JSON.stringify(taskStore.byId(targetId)))
  ElMessage.success(`已调整「${task.title}」时间`)
  undoStore.push({
    label: `调整任务「${task.title}」时间`,
    undo: async () => taskStore.restoreTask(before),
    redo: async () => taskStore.restoreTask(after)
  })
}
</script>

<style scoped>
.gantt-chart { display: flex; flex-direction: column; height: 100%; gap: 12px; }

.gantt-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.gantt-title { font-weight: 600; font-size: 13px; }
.gantt-hint { font-size: 11px; color: var(--pwb-text-secondary); }
.gantt-legend { margin-left: auto; display: flex; gap: 12px; }
.legend-item { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--pwb-text-secondary); }
.legend-item .dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }

.gantt-body {
  flex: 1;
  min-height: 0;
  display: flex;
  border: 1px solid var(--pwb-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--pwb-bg-card);
}

.gantt-labels {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--pwb-border);
  overflow: hidden;
}
.gantt-label-head {
  height: 48px;
  display: flex; align-items: center;
  padding: 0 12px;
  font-size: 12px;
  color: var(--pwb-text-secondary);
  border-bottom: 1px solid var(--pwb-border);
  flex-shrink: 0;
}
.gantt-label {
  display: flex; align-items: center; gap: 6px;
  padding: 0 12px;
  height: 52px;
  cursor: pointer;
  border-bottom: 1px solid var(--pwb-border);
  overflow: hidden;
  white-space: nowrap;
}
.gantt-label:hover { background: var(--pwb-bg-hover); }
.label-title {
  font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.label-title.strike { text-decoration: line-through; color: var(--pwb-text-secondary); }
.gantt-empty-label {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--pwb-text-secondary);
}

.gantt-scroll { flex: 1; overflow: auto; }
.gantt-timeline { position: relative; }

.gantt-head-row { display: flex; position: sticky; top: 0; z-index: 5; background: var(--pwb-bg-card); border-bottom: 1px solid var(--pwb-border); }
.gantt-head-cell {
  flex-shrink: 0;
  text-align: center;
  padding: 6px 0;
  border-right: 1px solid var(--pwb-border);
  font-size: 11px;
  color: var(--pwb-text-secondary);
}
.gantt-head-cell.weekend { background: var(--pwb-bg); }
.gantt-head-cell.today .head-day {
  color: var(--pwb-primary);
  font-weight: 700;
  width: 20px; height: 20px;
  line-height: 20px;
  margin: 0 auto;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pwb-primary) 14%, transparent);
}

.gantt-row {
  position: relative;
  display: flex;
  height: 52px;
  border-bottom: 1px solid var(--pwb-border);
}
.gantt-cell { flex-shrink: 0; border-right: 1px solid var(--pwb-border); }
.gantt-cell.weekend { background: var(--pwb-bg); }
.gantt-cell.today { background: color-mix(in srgb, var(--pwb-primary) 5%, transparent); }

.gantt-bar {
  position: absolute;
  top: 14px;
  height: 24px;
  border-radius: 6px;
  cursor: grab;
  overflow: hidden;
  display: flex;
  align-items: center;
  padding: 0 8px;
  transition: filter 0.15s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,.12);
}
.gantt-bar:hover { filter: brightness(1.1); }
.gantt-bar.dragging { opacity: 0.7; cursor: grabbing; }
.bar-text {
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-todo { background: #909399; }
.bar-doing { background: #3b6fe0; }
.bar-delayed { background: #f56c6c; }
.bar-done { background: #67c23a; }
.bar-canceled { background: #c0c4cc; }

.today-line {
  position: absolute;
  top: 48px;
  bottom: 0;
  width: 2px;
  background: var(--pwb-primary);
  z-index: 4;
  pointer-events: none;
  opacity: 0.75;
}
.today-line::before {
  content: '';
  position: absolute;
  top: 0; left: -3px;
  width: 0; height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--pwb-primary);
}
</style>
