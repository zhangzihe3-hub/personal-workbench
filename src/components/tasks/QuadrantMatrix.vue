<template>
  <div class="matrix-view">
    <div class="axis-y">重要 →</div>
    <div class="matrix-grid">
      <div
        v-for="q in quadrants" :key="q.key"
        class="matrix-cell"
        :style="{ borderColor: q.color }"
      >
        <div class="cell-head" :style="{ background: q.color }">
          <span class="cell-label">{{ q.label }}</span>
          <span class="cell-hint">{{ q.hint }}</span>
          <span class="cell-count">{{ cellTasks(q).length }}</span>
        </div>
        <div class="cell-body">
          <div
            v-for="task in cellTasks(q)" :key="task.task_id"
            class="matrix-task"
            :class="{ done: task.status === 'done' }"
            @click="uiStore.openDetail('task', task.task_id)"
          >
            <button class="check-btn" :class="{ checked: task.status === 'done' }" @click.stop="emitToggle(task)">
              <el-icon v-if="task.status === 'done'"><Check /></el-icon>
            </button>
            <span class="mt-title" :class="{ strike: task.status === 'done' }">{{ task.title }}</span>
            <span v-if="task.deadline" class="mt-deadline" :class="{ overdue: isOverdue(task) }">{{ fmtDate(task.deadline) }}</span>
          </div>
          <div v-if="cellTasks(q).length === 0" class="cell-empty">空</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useTaskStore, QUADRANTS } from '@/stores/task'
import { useUiStore } from '@/stores/ui'
import { fmtDate, isPast } from '@/utils/datetime'

const props = defineProps({ tasks: { type: Array, default: () => [] } })
const emit = defineEmits(['toggle'])

const uiStore = useUiStore()
const quadrants = QUADRANTS

function cellTasks(q) {
  return props.tasks.filter(t => t.important === q.important && t.urgent === q.urgent)
}

function isOverdue(task) {
  return task.deadline && isPast(task.deadline) && task.status !== 'done' && task.status !== 'canceled'
}

function emitToggle(task) {
  emit('toggle', task)
}
</script>

<style scoped>
.matrix-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100%;
  gap: 4px;
}
.axis-y { font-size: 11px; color: var(--pwb-text-secondary); text-align: center; }
.matrix-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 10px;
  min-height: 0;
}
.matrix-cell {
  display: flex;
  flex-direction: column;
  border: 2px solid;
  border-radius: 10px;
  overflow: hidden;
  min-height: 0;
  background: var(--pwb-bg-card);
}
.cell-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  color: #fff;
  flex-shrink: 0;
}
.cell-label { font-weight: 600; font-size: 13px; }
.cell-hint { font-size: 11px; opacity: 0.85; }
.cell-count {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 9px;
  padding: 0 8px;
  font-size: 11px;
}
.cell-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.matrix-task {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.matrix-task:hover { background: var(--pwb-bg-hover); }
.matrix-task.done { opacity: 0.6; }
.mt-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mt-title.strike { text-decoration: line-through; color: var(--pwb-text-secondary); }
.mt-deadline { font-size: 11px; color: var(--pwb-text-secondary); white-space: nowrap; }
.mt-deadline.overdue { color: var(--pwb-p0); font-weight: 600; }
.cell-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pwb-text-secondary);
  font-size: 12px;
}
.check-btn {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--pwb-text-secondary);
  background: transparent;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  font-size: 10px;
}
.check-btn.checked { background: var(--pwb-primary); border-color: var(--pwb-primary); }
</style>
