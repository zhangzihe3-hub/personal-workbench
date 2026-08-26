<template>
  <el-dialog
    :model-value="!!uiStore.reminderPopup"
    title="日程提醒"
    width="420px"
    class="mobile-sheet-dialog reminder-dialog"
    @update:model-value="uiStore.reminderPopup = null"
  >
    <div v-if="sch" class="reminder-content">
      <h3>{{ sch.title }}</h3>
      <p><el-icon><Clock /></el-icon> {{ fmtDateTime(sch.start_time) }} — {{ fmtTime(sch.end_time) }}</p>
      <p v-if="sch.location"><el-icon><Location /></el-icon> {{ sch.location }}</p>
      <div v-if="relatedTasks.length" class="related">
        <p class="related-title">关联任务：</p>
        <div v-for="t in relatedTasks" :key="t.task_id" class="related-task" @click="openTask(t.task_id)">
          {{ t.title }} <span class="go">查看 →</span>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="uiStore.reminderPopup = null">知道了</el-button>
      <el-button type="primary" @click="openDetail">查看日程</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useTaskStore } from '@/stores/task'
import { fmtDateTime, fmtTime } from '@/utils/datetime'

const uiStore = useUiStore()
const taskStore = useTaskStore()

const sch = computed(() => uiStore.reminderPopup?.schedule)
const relatedTasks = computed(() => {
  if (!sch.value?.related_task_ids) return []
  return sch.value.related_task_ids.map(id => taskStore.byId(id)).filter(Boolean)
})

function openDetail() {
  const id = sch.value?._master_id || sch.value?.schedule_id
  if (id) uiStore.openDetail('schedule', id)
  uiStore.reminderPopup = null
}

function openTask(id) {
  uiStore.openDetail('task', id)
  uiStore.reminderPopup = null
}
</script>

<style scoped>
.reminder-content h3 { margin: 0 0 12px; }
.reminder-content p { display: flex; align-items: center; gap: 6px; margin: 6px 0; color: var(--pwb-text-secondary); }
.related { margin-top: 12px; }
.related-title { font-weight: 600; color: var(--pwb-text) !important; }
.related-task {
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--pwb-bg-hover);
  margin-bottom: 4px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
}
.related-task .go { color: var(--pwb-primary); font-size: 12px; }
</style>
