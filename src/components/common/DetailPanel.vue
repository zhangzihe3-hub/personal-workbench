<template>
  <transition name="slide">
    <aside v-if="uiStore.detailPanel.visible" class="detail-panel">
      <div class="panel-header">
        <span class="panel-title">{{ titleMap[uiStore.detailPanel.type] || '详情' }}</span>
        <el-button text circle @click="uiStore.closeDetail()"><el-icon><Close /></el-icon></el-button>
      </div>
      <div class="panel-body">
        <TaskDetail v-if="uiStore.detailPanel.type === 'task'" :task-id="uiStore.detailPanel.id" />
        <ScheduleDetail
          v-else-if="uiStore.detailPanel.type === 'schedule'"
          :schedule-id="uiStore.detailPanel.id"
          :instance-date="uiStore.detailPanel.context?.instanceDate || null"
        />
        <NoteDetail v-else-if="uiStore.detailPanel.type === 'note'" :note-id="uiStore.detailPanel.id" />
      </div>
    </aside>
  </transition>
</template>

<script setup>
import { useUiStore } from '@/stores/ui'
import TaskDetail from '@/components/detail/TaskDetail.vue'
import ScheduleDetail from '@/components/detail/ScheduleDetail.vue'
import NoteDetail from '@/components/detail/NoteDetail.vue'

const uiStore = useUiStore()
const titleMap = { task: '任务详情', schedule: '日程详情', note: '笔记详情' }
</script>

<style scoped>
.detail-panel {
  width: 400px;
  flex-shrink: 0;
  background: var(--pwb-bg-card);
  border-left: 1px solid var(--pwb-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--pwb-border);
  flex-shrink: 0;
}
.panel-title { font-weight: 600; }
.panel-body { flex: 1; overflow-y: auto; padding: 16px; }

.slide-enter-active, .slide-leave-active { transition: all 0.2s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(40px); opacity: 0; }

@media (min-width: 641px) and (max-width: 900px) {
  .detail-panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(430px, calc(100vw - 64px)); z-index: 1800;
    box-shadow: -14px 0 36px rgba(15, 23, 42, .14);
  }
}

@media (max-width: 640px) {
  .detail-panel {
    position: fixed; inset: 0; width: 100%; z-index: 1000;
    border-left: 0;
  }
  .panel-header { height: 52px; padding-left: 20px; }
  .panel-body { padding: 14px; }
}
</style>
