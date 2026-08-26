<template>
  <div class="page-container dashboard">
    <div class="mobile-dashboard-intro">
      <strong>今天也要专注高效</strong>
      <span>{{ todayText }}</span>
    </div>
    <div class="mobile-section-title">今日概览</div>
    <!-- 今日概览四卡 -->
    <div class="stat-cards">
      <div class="stat-card pwb-card" @click="$router.push('/tasks')">
        <div class="stat-icon" style="background: rgba(59,111,224,.12); color: #3b6fe0"><el-icon :size="22"><List /></el-icon></div>
        <div>
          <div class="stat-num">{{ taskStore.todayTasks.length }}</div>
          <div class="stat-label">今日待办</div>
        </div>
      </div>
      <div class="stat-card pwb-card" @click="$router.push('/schedule')">
        <div class="stat-icon" style="background: rgba(230,162,60,.14); color: #e6a23c"><el-icon :size="22"><Calendar /></el-icon></div>
        <div>
          <div class="stat-num">{{ scheduleStore.todaySchedules.length }}</div>
          <div class="stat-label">今日日程</div>
        </div>
      </div>
      <div class="stat-card pwb-card" @click="$router.push('/tasks')">
        <div class="stat-icon" style="background: rgba(103,194,58,.14); color: #67c23a"><el-icon :size="22"><CircleCheck /></el-icon></div>
        <div>
          <div class="stat-num">{{ taskStore.todayDone.length }}</div>
          <div class="stat-label">今日完成</div>
        </div>
      </div>
      <div class="stat-card pwb-card" @click="$router.push('/tasks')">
        <div class="stat-icon" style="background: rgba(245,108,108,.14); color: #f56c6c"><el-icon :size="22"><Warning /></el-icon></div>
        <div>
          <div class="stat-num">{{ taskStore.delayedTasks.length }}</div>
          <div class="stat-label">延期任务</div>
        </div>
      </div>
    </div>

    <!-- 主区域 -->
    <div class="dashboard-grid">
      <!-- 待办清单 -->
      <div class="pwb-card block">
        <div class="block-header">
          <span class="block-title">待办清单</span>
          <el-button text size="small" @click="$router.push('/tasks')">全部任务 →</el-button>
        </div>
        <div v-if="topTodos.length" class="todo-list">
          <div v-for="t in topTodos" :key="t.task_id" class="todo-item" @click="uiStore.openDetail('task', t.task_id)">
            <el-checkbox :model-value="t.status === 'done'" @click.stop="toggleDone(t)" />
            <QuadrantTag :task="t" />
            <span class="todo-title" :class="{ done: t.status === 'done' }">{{ t.title }}</span>
            <span v-if="t.deadline" class="todo-deadline" :class="{ overdue: t.deadline < nowIso }">{{ fmtTime(t.deadline) }}</span>
          </div>
        </div>
        <el-empty v-else description="暂无待办任务，点击右上角新建" :image-size="60" />
      </div>

      <!-- 今日日程时间轴 -->
      <div class="pwb-card block">
        <div class="block-header">
          <span class="block-title">今日日程</span>
          <el-button text size="small" @click="$router.push('/schedule')">日程页 →</el-button>
        </div>
        <div v-if="scheduleStore.todaySchedules.length" class="timeline">
          <div
            v-for="s in scheduleStore.todaySchedules" :key="s.schedule_id + (s._instance_date || '')"
            class="timeline-item"
            :class="{ past: isPast(s.end_time) }"
            @click="uiStore.openDetail('schedule', s._master_id || s.schedule_id)"
          >
            <div class="timeline-time">{{ fmtTime(s.start_time) }}<span class="timeline-end">{{ fmtTime(s.end_time) }}</span></div>
            <div class="timeline-dot" :style="{ background: categoryColor(s.category) }"></div>
            <div class="timeline-body">
              <div class="timeline-title">{{ s.title }}</div>
              <div v-if="s.location" class="timeline-loc">{{ s.location }}</div>
            </div>
          </div>
        </div>
        <el-empty v-else description="今天暂无日程安排" :image-size="60" />
      </div>

      <!-- 最近笔记 -->
      <div class="pwb-card block">
        <div class="block-header">
          <span class="block-title">最近笔记</span>
          <el-button text size="small" @click="$router.push('/notes')">笔记页 →</el-button>
        </div>
        <div v-if="recentNotes.length" class="note-list">
          <div v-for="n in recentNotes" :key="n.note_id" class="note-item" @click="uiStore.openDetail('note', n.note_id)">
            <div class="note-title">{{ n.title }}</div>
            <div class="note-sub">{{ noteSnippet(n.content) }}</div>
            <div class="note-meta">{{ n.folder }} · {{ fmtDate(n.updated_at) }} · {{ n.word_count }} 字</div>
          </div>
        </div>
        <el-empty v-else description="还没有笔记，Ctrl+Shift+N 快速速记" :image-size="60" />
      </div>

      <!-- 专注时长 -->
      <div class="pwb-card block focus-block" @click="$router.push('/toolbox')">
        <div class="block-header">
          <span class="block-title">今日专注</span>
          <el-button text size="small" @click.stop="$router.push('/toolbox')">工具箱 →</el-button>
        </div>
        <div class="focus-body">
          <div class="focus-ring" :style="{ background: `conic-gradient(var(--pwb-primary) ${focusRatio}%, var(--pwb-bg-hover) 0)` }">
            <div class="focus-ring-inner">
              <span class="focus-num">{{ toolboxStore.todayFocusMinutes }}</span>
              <span class="focus-unit">分钟</span>
            </div>
          </div>
          <div class="focus-info">
            <div class="focus-line">今日 <b>{{ toolboxStore.todayFocusMinutes }}</b> 分钟</div>
            <div class="focus-line">累计 <b>{{ toolboxStore.totalFocusMinutes }}</b> 分钟</div>
            <div class="focus-hint">用番茄钟开启一段专注</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTaskStore } from '@/stores/task'
import { useScheduleStore } from '@/stores/schedule'
import { useNoteStore } from '@/stores/note'
import { useToolboxStore } from '@/stores/toolbox'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { dayjs, fmtTime, fmtDate, isPast } from '@/utils/datetime'
import { defaultTaskSort } from '@/stores/task'
import { categoryColor } from '@/components/schedule/categoryColor'
import QuadrantTag from '@/components/tasks/QuadrantTag.vue'

const taskStore = useTaskStore()
const scheduleStore = useScheduleStore()
const noteStore = useNoteStore()
const toolboxStore = useToolboxStore()
const uiStore = useUiStore()
const undoStore = useUndoStore()

const nowIso = new Date().toISOString()
const today = dayjs()
const todayText = `${today.format('M月D日')} 星期${'日一二三四五六'[today.day()]}`

/** 优先级前5的待办（未完成未取消，按默认排序） */
const topTodos = computed(() =>
  [...taskStore.tasks]
    .filter(t => t.status !== 'done' && t.status !== 'canceled')
    .sort(defaultTaskSort)
    .slice(0, 5)
)

const recentNotes = computed(() => noteStore.recentNotes.slice(0, 3))

function noteSnippet(content = '') {
  const plain = content.replace(/[#*>`\-\[\]()!|]/g, '').replace(/\s+/g, ' ').trim()
  return plain.slice(0, 40) || '（空白笔记）'
}

async function toggleDone(t) {
  const target = t.status === 'done' ? 'todo' : 'done'
  await taskStore.setStatus(t.task_id, target)
  undoStore.push({
    label: target === 'done' ? `完成任务「${t.title}」` : `恢复任务「${t.title}」`,
    undo: async () => taskStore.setStatus(t.task_id, target === 'done' ? 'todo' : 'done'),
    redo: async () => taskStore.setStatus(t.task_id, target)
  })
}

/** 今日专注比例：按 8 小时（480 分钟）为满值 */
const focusRatio = computed(() => Math.min(100, Math.round((toolboxStore.todayFocusMinutes / 480) * 100)))
</script>

<style scoped>
.dashboard { overflow-y: auto; }
.mobile-dashboard-intro, .mobile-section-title { display: none; }

.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
.stat-card {
  display: flex; align-items: center; gap: 14px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.08); }
.stat-icon {
  width: 48px; height: 48px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.stat-num { font-size: 26px; font-weight: 700; line-height: 1.1; }
.stat-label { font-size: 12px; color: var(--pwb-text-secondary); }

.dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.block { min-height: 180px; }
.block-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.block-title { font-size: 15px; font-weight: 600; }

.todo-list { display: flex; flex-direction: column; gap: 2px; }
.todo-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.todo-item:hover { background: var(--pwb-bg-hover); }
.prio-chip { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 1px 5px; color: #fff; }
.todo-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-title.done { text-decoration: line-through; color: var(--pwb-text-secondary); }
.todo-deadline { font-size: 12px; color: var(--pwb-text-secondary); }
.todo-deadline.overdue { color: var(--pwb-p0); font-weight: 600; }

.timeline { display: flex; flex-direction: column; gap: 0; }
.timeline-item { display: flex; align-items: flex-start; gap: 10px; padding: 7px 0; cursor: pointer; border-radius: 8px; }
.timeline-item:hover { background: var(--pwb-bg-hover); }
.timeline-item.past { opacity: 0.45; }
.timeline-time { width: 52px; font-size: 13px; font-weight: 600; display: flex; flex-direction: column; flex-shrink: 0; }
.timeline-end { font-size: 11px; font-weight: 400; color: var(--pwb-text-secondary); }
.timeline-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.timeline-body { flex: 1; min-width: 0; }
.timeline-title { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline-loc { font-size: 11px; color: var(--pwb-text-secondary); }

.note-list { display: flex; flex-direction: column; gap: 2px; }
.note-item { padding: 8px; border-radius: 8px; cursor: pointer; transition: background 0.12s ease; }
.note-item:hover { background: var(--pwb-bg-hover); }
.note-title { font-weight: 600; font-size: 13px; }
.note-sub { font-size: 12px; color: var(--pwb-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note-meta { font-size: 11px; color: var(--pwb-text-secondary); margin-top: 2px; }

.focus-body { display: flex; align-items: center; gap: 20px; padding: 8px 0; }
.focus-ring {
  width: 96px; height: 96px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.focus-ring-inner {
  width: 76px; height: 76px; border-radius: 50%;
  background: var(--pwb-bg-card);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.focus-num { font-size: 26px; font-weight: 700; line-height: 1; }
.focus-unit { font-size: 11px; color: var(--pwb-text-secondary); }
.focus-info { display: flex; flex-direction: column; gap: 6px; }
.focus-line { font-size: 13px; }
.focus-line b { font-size: 16px; color: var(--pwb-primary); }
.focus-hint { font-size: 11px; color: var(--pwb-text-secondary); }

@media (max-width: 1100px) {
  .stat-cards { grid-template-columns: repeat(2, 1fr); }
  .dashboard-grid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .dashboard { padding: 14px 16px 24px; background: var(--pwb-bg-card); }
  .mobile-dashboard-intro { display: flex; flex-direction: column; gap: 4px; margin: 2px 0 20px; }
  .mobile-dashboard-intro strong { font-size: 16px; font-weight: 600; }
  .mobile-dashboard-intro span { color: var(--pwb-text-secondary); font-size: 13px; }
  .mobile-section-title { display: block; font-size: 17px; font-weight: 700; margin-bottom: 10px; }
  .stat-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin: 0 0 24px; border: 1px solid var(--pwb-border); border-radius: 14px; overflow: hidden; }
  .stat-card { padding: 12px 4px; border: 0; border-radius: 0; box-shadow: none; flex-direction: column; gap: 6px; text-align: center; position: relative; }
  .stat-card + .stat-card::before { content: ''; position: absolute; left: 0; top: 20%; bottom: 20%; width: 1px; background: var(--pwb-border); }
  .stat-icon { width: 30px; height: 30px; margin: 0 auto; background: transparent !important; }
  .stat-num { font-size: 19px; line-height: 1.1; }
  .stat-label { font-size: 10px; white-space: nowrap; }
  .dashboard-grid { gap: 24px; }
  .block { padding: 0; border: 0; border-radius: 0; box-shadow: none; }
  .block-header { min-height: 40px; margin: 0; border-bottom: 1px solid var(--pwb-border); }
  .block-title { font-size: 17px; }
  .todo-item, .note-item { min-height: 52px; padding: 11px 2px; border-bottom: 1px solid color-mix(in srgb, var(--pwb-border) 75%, transparent); }
  .todo-item:last-child, .note-item:last-child { border-bottom: 0; }
  .todo-item :deep(.quadrant-tag) { display: none; }
  .todo-title { font-size: 14px; }
  .timeline-item { min-height: 56px; padding: 9px 2px; }
  .timeline-time { width: 48px; }
  .focus-block { padding-bottom: 12px; }
  :deep(.el-empty) { padding: 20px 0; }
  :deep(.el-empty__image) { display: none; }
}
</style>
