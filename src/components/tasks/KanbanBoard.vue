<template>
  <div class="kanban-board">
    <div
      v-for="col in columns" :key="col.status"
      class="kanban-col"
      :class="{ 'drag-over': dragOver === col.status }"
      @dragover.prevent="dragOver = col.status"
      @dragleave="dragOver = null"
      @drop.prevent="dropTo(col.status)"
    >
      <div class="col-header">
        <span class="col-dot" :style="{ background: col.color }"></span>
        <span class="col-name">{{ col.label }}</span>
        <span class="col-count">{{ colTasks(col.status).length }}</span>
      </div>
      <div class="col-body">
        <div
          v-for="task in colTasks(col.status)" :key="taskKey(task)"
          class="kanban-card"
          :class="{ done: task.status === 'done' }"
          draggable="true"
          @dragstart="dragStart(task)"
          @dragend="dragEnd"
          @click="openDetail(task)"
        >
          <div class="card-line1">
            <QuadrantTag :task="task" />
            <span class="card-title" :class="{ strike: task.status === 'done' }">{{ task.title }}</span>
          </div>
          <div v-if="task._instance_date" class="card-inst">{{ task._instance_date.slice(5) }}</div>
          <div v-if="task.subtasks.length" class="card-sub">
            <el-icon :size="12"><Finished /></el-icon>子任务 {{ subDoneCount(task) }}/{{ task.subtasks.length }}
          </div>
          <div class="card-line2">
            <span v-if="task.deadline" class="meta-chip" :class="{ overdue: isOverdue(task) }">
              <el-icon :size="12"><AlarmClock /></el-icon>{{ fmtDate(task.deadline) }}
            </span>
            <span v-if="task.category && task.category !== '待分类'" class="meta-chip">{{ task.category }}</span>
          </div>
          <div v-if="task.tags.length" class="card-tags">
            <span v-for="t in task.tags" :key="t" class="tag-chip">#{{ t }}</span>
          </div>
        </div>
        <div v-if="colTasks(col.status).length === 0" class="col-empty">
          <span>拖拽任务到此处</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useTaskStore } from '@/stores/task'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { fmtDate, isPast } from '@/utils/datetime'
import QuadrantTag from '@/components/tasks/QuadrantTag.vue'

const props = defineProps({ tasks: { type: Array, default: () => [] } })

const taskStore = useTaskStore()
const uiStore = useUiStore()
const undoStore = useUndoStore()

const columns = [
  { status: 'todo', label: '待开始', color: '#909399' },
  { status: 'doing', label: '进行中', color: '#3b6fe0' },
  { status: 'delayed', label: '已延期', color: '#f56c6c' },
  { status: 'done', label: '已完成', color: '#67c23a' },
  { status: 'canceled', label: '已取消', color: '#c0c4cc' }
]

const dragTask = ref(null)
const dragOver = ref(null)

function colTasks(status) {
  return props.tasks.filter(t => t.status === status)
}

function subDoneCount(task) {
  return task.subtasks.filter(s => s.status === 'done').length
}

function isOverdue(task) {
  return task.deadline && isPast(task.deadline) && task.status !== 'done' && task.status !== 'canceled'
}

function taskKey(task) {
  return task._instance_date ? `${task.task_id}_${task._instance_date}` : task.task_id
}

function openDetail(task) {
  uiStore.openDetail('task', task._master_id || task.task_id)
}

function dragStart(task) {
  dragTask.value = task
}
function dragEnd() {
  dragTask.value = null
  dragOver.value = null
}

/** 拖拽卡片到目标列 → 修改状态（重复实例到 done 列 = 完成本次，可撤销） */
async function dropTo(status) {
  const task = dragTask.value
  dragEnd()
  if (!task) return
  const targetId = task._master_id || task.task_id
  const master = taskStore.byId(targetId)
  if (!master) return
  // 重复实例拖到 done 列：完成本次
  if (task._instance_date && task._master_id && status === 'done') {
    const before = JSON.parse(JSON.stringify(master))
    await taskStore.markInstance(task._master_id, task._instance_date, 'complete')
    const after = JSON.parse(JSON.stringify(taskStore.byId(task._master_id)))
    ElMessage.success('已完成本次')
    undoStore.push({
      label: `完成重复任务「${task.title}」本次`,
      undo: async () => taskStore.restoreTask(before),
      redo: async () => taskStore.restoreTask(after)
    })
    return
  }
  if (master.status === status) return
  const before = JSON.parse(JSON.stringify(master))
  await taskStore.setStatus(targetId, status)
  const after = JSON.parse(JSON.stringify(taskStore.byId(targetId)))
  const colLabel = columns.find(c => c.status === status)?.label || status
  ElMessage.success(`「${task.title}」已移至「${colLabel}」`)
  undoStore.push({
    label: `移动任务「${task.title}」至${colLabel}`,
    undo: async () => taskStore.restoreTask(before),
    redo: async () => taskStore.restoreTask(after)
  })
}
</script>

<style scoped>
.kanban-board {
  display: flex;
  gap: 12px;
  height: 100%;
  min-height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
  align-items: stretch;
}

.kanban-col {
  flex: 0 0 272px;
  display: flex;
  flex-direction: column;
  background: var(--pwb-bg-hover);
  border-radius: 10px;
  border: 1px solid transparent;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.kanban-col.drag-over {
  border-color: var(--pwb-primary);
  background: color-mix(in srgb, var(--pwb-primary) 8%, var(--pwb-bg-hover));
}

.col-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 8px;
  flex-shrink: 0;
}
.col-dot { width: 10px; height: 10px; border-radius: 50%; }
.col-name { font-weight: 600; font-size: 13px; }
.col-count {
  margin-left: auto;
  font-size: 11px;
  background: var(--pwb-bg-card);
  border-radius: 10px;
  padding: 1px 8px;
  color: var(--pwb-text-secondary);
}

.col-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
}

.kanban-card {
  background: var(--pwb-bg-card);
  border: 1px solid var(--pwb-border);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.1s ease;
  user-select: none;
}
.kanban-card:hover {
  box-shadow: var(--pwb-shadow);
  transform: translateY(-1px);
}
.kanban-card:active { cursor: grabbing; }
.kanban-card.done { opacity: 0.72; }

.card-line1 { display: flex; align-items: flex-start; gap: 6px; }
.card-title { font-size: 13px; font-weight: 500; line-height: 1.5; word-break: break-all; }
.card-title.strike { text-decoration: line-through; color: var(--pwb-text-secondary); }
.card-inst {
  margin-top: 4px;
  font-size: 11px;
  color: var(--pwb-text-secondary);
}

.card-sub {
  display: flex; align-items: center; gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--pwb-text-secondary);
}

.card-line2 { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.meta-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px;
  color: var(--pwb-text-secondary);
}
.meta-chip.overdue { color: var(--pwb-p0); font-weight: 600; }

.card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.tag-chip {
  font-size: 10px;
  color: var(--pwb-primary);
  background: color-mix(in srgb, var(--pwb-primary) 8%, transparent);
  border-radius: 4px;
  padding: 1px 6px;
}

.col-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  border: 1px dashed var(--pwb-border);
  border-radius: 8px;
  color: var(--pwb-text-secondary);
  font-size: 12px;
}
</style>
