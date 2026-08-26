<template>
  <el-dialog
    :model-value="uiStore.searchVisible"
    title="全局搜索"
    width="640px"
    top="10vh"
    class="global-search-dialog mobile-page-dialog"
    :close-on-click-modal="true"
    @update:model-value="uiStore.closeSearch()"
    @opened="focusInput"
    @closed="reset"
  >
    <div class="search-box">
      <el-input
        ref="inputRef"
        v-model="keyword"
        size="large"
        placeholder="搜索任务、日程、笔记…（↑↓ 选择，Enter 打开，Esc 关闭）"
        clearable
        @input="search"
        @keydown.up.prevent="move(-1)"
        @keydown.down.prevent="move(1)"
        @keydown.enter.prevent="openSelected"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </div>

    <!-- 搜索结果 -->
    <div class="results" v-loading="loading">
      <template v-if="keyword.trim()">
        <template v-if="grouped.length === 0">
          <el-empty description="未找到匹配结果" :image-size="80" />
        </template>
        <div v-for="group in grouped" :key="group.type" class="result-group">
          <div class="group-title">
            <el-icon><component :is="group.icon" /></el-icon>
            {{ group.label }}
            <span class="count">{{ group.items.length }}</span>
          </div>
          <div
            v-for="(item, i) in group.items"
            :key="item.id"
            class="result-item"
            :class="{ selected: i === cursorInGroup(group.type) }"
            @mouseenter="setCursor(group.type, i)"
            @click="openItem(group.type, item)"
          >
            <div class="item-main">
              <span v-html="highlight(item.title)"></span>
              <!-- 任务可直接勾选完成 -->
              <el-checkbox
                v-if="group.type === 'task' && item.status !== 'done' && item.status !== 'canceled'"
                class="quick-done"
                :model-value="false"
                @click.stop="quickDone(item)"
              />
              <QuadrantTag v-if="group.type === 'task'" :important="item.important" :urgent="item.urgent" />
            </div>
            <div class="item-sub" v-html="highlight(item.sub || '')"></div>
            <div class="item-meta">
              <span v-if="item.meta">{{ item.meta }}</span>
              <span v-if="group.type === 'task' && item.statusLabel" class="status">{{ item.statusLabel }}</span>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="hint">
        <p>支持跨任务、日程、笔记全文检索，关键词高亮显示。</p>
        <p class="shortcut"><kbd>Ctrl K</kbd> 呼出 · <kbd>↑↓</kbd> 选择 · <kbd>Enter</kbd> 打开 · <kbd>Esc</kbd> 关闭</p>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useTaskStore } from '@/stores/task'
import { useScheduleStore } from '@/stores/schedule'
import { useNoteStore } from '@/stores/note'
import { fmtDateTime, fmtDate } from '@/utils/datetime'
import QuadrantTag from '@/components/tasks/QuadrantTag.vue'

const uiStore = useUiStore()
const taskStore = useTaskStore()
const scheduleStore = useScheduleStore()
const noteStore = useNoteStore()
const router = useRouter()

const keyword = ref('')
const loading = ref(false)
const cursor = ref({ task: 0, schedule: 0, note: 0 })
const inputRef = ref(null)

const STATUS_LABEL = { todo: '待开始', doing: '进行中', done: '已完成', canceled: '已取消', delayed: '已延期' }

function focusInput() {
  nextTick(() => inputRef.value?.focus())
}

function reset() {
  keyword.value = ''
  cursor.value = { task: 0, schedule: 0, note: 0 }
}

function escapeHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function highlight(text = '') {
  const kw = keyword.value.trim()
  if (!kw) return escapeHtml(text)
  const escaped = escapeHtml(text)
  const regex = new RegExp(`(${kw.split(/\s+/).filter(Boolean).map(escapeHtml).join('|')})`, 'gi')
  return escaped.replace(regex, '<mark class="highlight-mark">$1</mark>')
}

const grouped = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return []

  const matchTask = (t) => (t.title || '').toLowerCase().includes(kw) || (t.description || '').toLowerCase().includes(kw)
  const matchSch = (s) => (s.title || '').toLowerCase().includes(kw) || (s.remark || '').toLowerCase().includes(kw) || (s.location || '').toLowerCase().includes(kw)
  const matchNote = (n) => (n.title || '').toLowerCase().includes(kw) || (n.content || '').toLowerCase().includes(kw)

  const tasks = taskStore.tasks.filter(matchTask).slice(0, 8).map(t => ({
    id: t.task_id,
    title: t.title,
    sub: stripMd(t.description || ''),
    meta: `${t.category || '待分类'} · ${t.deadline ? '截止 ' + fmtDateTime(t.deadline) : '无截止'}`,
    status: t.status,
    statusLabel: STATUS_LABEL[t.status] || t.status,
    important: t.important,
    urgent: t.urgent,
    entity: t
  }))

  const schedules = scheduleStore.schedules
    .filter(s => s.repeat_type !== 'exception')
    .filter(matchSch).slice(0, 8)
    .map(s => ({
      id: s.schedule_id,
      title: s.title,
      sub: s.location ? `地点：${s.location}` : '',
      meta: `${fmtDateTime(s.start_time)} — ${fmtDateTime(s.end_time)}`,
      entity: s
    }))

  const notes = noteStore.notes.filter(matchNote).slice(0, 8).map(n => ({
    id: n.note_id,
    title: n.title,
    sub: stripMd(n.content || '').slice(0, 60),
    meta: `${n.folder} · ${fmtDate(n.updated_at)} 更新 · ${n.word_count} 字`,
    entity: n
  }))

  return [
    { type: 'task', label: '任务', icon: 'List', items: tasks },
    { type: 'schedule', label: '日程', icon: 'Calendar', items: schedules },
    { type: 'note', label: '笔记', icon: 'Notebook', items: notes }
  ].filter(g => g.items.length > 0)
})

function stripMd(text) {
  return (text || '').replace(/[#*>`\-\[\]()!|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function cursorInGroup(type) {
  return cursor.value[type] ?? 0
}

function setCursor(type, i) {
  cursor.value[type] = i
}

function move(dir) {
  const groups = grouped.value
  if (groups.length === 0) return
  // 找到当前光标所在分组，在该分组内循环移动
  let currentType = null
  let currentIndex = -1
  for (const g of groups) {
    const idx = cursor.value[g.type] ?? 0
    if (idx < g.items.length) { currentType = g.type; currentIndex = idx; break }
  }
  if (!currentType) return
  const g = groups.find(x => x.type === currentType)
  const len = g.items.length
  cursor.value[currentType] = (currentIndex + dir + len) % len
}

function openSelected() {
  const groups = grouped.value
  if (groups.length === 0) return
  for (const g of groups) {
    const idx = cursor.value[g.type] ?? 0
    if (idx < g.items.length) {
      openItem(g.type, g.items[idx])
      return
    }
  }
}

function quickDone(item) {
  taskStore.setStatus(item.id, 'done')
  uiStore.closeSearch()
}

function openItem(type, item) {
  uiStore.closeSearch()
  if (type === 'task') {
    router.push('/tasks')
    uiStore.openDetail('task', item.id)
  } else if (type === 'schedule') {
    router.push('/schedule')
    uiStore.openDetail('schedule', item.id)
  } else {
    router.push('/notes')
    uiStore.openDetail('note', item.id)
  }
}
</script>

<style scoped>
.search-box { margin-bottom: 12px; }
.results { max-height: 52vh; overflow-y: auto; min-height: 120px; }
.result-group { margin-bottom: 12px; }
.group-title {
  display: flex; align-items: center; gap: 6px;
  font-weight: 600; font-size: 13px;
  color: var(--pwb-text-secondary);
  margin-bottom: 6px;
}
.count { font-size: 11px; background: var(--pwb-bg-hover); border-radius: 8px; padding: 0 6px; }
.result-item {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.result-item.selected { background: color-mix(in srgb, var(--pwb-primary) 10%, transparent); }
.result-item:hover { background: var(--pwb-bg-hover); }
.item-main { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.quick-done { margin-left: auto; }
.prio { margin-left: auto; }
.item-sub {
  font-size: 12px; color: var(--pwb-text-secondary);
  margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.item-meta { font-size: 11px; color: var(--pwb-text-secondary); margin-top: 2px; display: flex; gap: 8px; }
.status { color: var(--pwb-primary); }
.hint { text-align: center; color: var(--pwb-text-secondary); padding: 24px 0; }
.hint p { margin: 4px 0; }
.shortcut kbd {
  background: var(--pwb-bg-card);
  border: 1px solid var(--pwb-border);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 12px;
  font-family: inherit;
}
</style>
