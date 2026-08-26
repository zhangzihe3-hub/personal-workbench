<template>
  <div v-if="task" class="task-detail">
    <!-- 标题 + 置顶 -->
    <div class="field">
      <div class="title-row">
        <el-input v-model="form.title" placeholder="任务标题" size="large" @change="saveTitle" />
        <el-tooltip :content="form.pinned ? '取消置顶' : '置顶'" :show-after="300">
          <el-button text circle :type="form.pinned ? 'warning' : 'default'" @click="togglePin">
            <el-icon :size="18"><Top /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 状态流转 -->
    <div class="field status-row">
      <el-radio-group v-model="form.status" size="small" @change="saveStatus">
        <el-radio-button v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 四象限 -->
    <div class="field">
      <div class="label">四象限</div>
      <div class="quadrant-picker">
        <el-checkbox v-model="form.important" label="重要" border size="small" @change="savePatch({ important: form.important })" />
        <el-checkbox v-model="form.urgent" label="紧急" border size="small" @change="savePatch({ urgent: form.urgent })" />
        <span class="quadrant-hint">{{ quadrantLabel }}</span>
      </div>
    </div>

    <!-- 开始 / 截止时间 -->
    <div class="field-row">
      <div class="field">
        <div class="label">开始时间</div>
        <el-date-picker
          v-model="form.start_time"
          type="datetime"
          placeholder="无"
          size="small"
          style="width: 100%"
          value-format="YYYY-MM-DDTHH:mm:ss"
          clearable
          @change="saveStartTime"
        />
      </div>
      <div class="field">
        <div class="label">截止时间</div>
        <el-date-picker
          v-model="form.deadline"
          type="datetime"
          placeholder="无截止"
          size="small"
          style="width: 100%"
          value-format="YYYY-MM-DDTHH:mm:ss"
          clearable
          @change="saveDeadline"
        />
      </div>
    </div>

    <!-- 重复 + 提醒 -->
    <div class="field-row">
      <div class="field">
        <div class="label">重复</div>
        <el-select v-model="form.repeat_type" size="small" style="width: 100%" @change="savePatch({ repeat_type: form.repeat_type })">
          <el-option label="不重复" value="none" />
          <el-option label="每天" value="daily" />
          <el-option label="每周" value="weekly" />
          <el-option label="每月" value="monthly" />
          <el-option label="每年" value="yearly" />
        </el-select>
      </div>
      <div class="field">
        <div class="label">提醒</div>
        <el-select v-model="reminderModel" size="small" style="width: 100%" @change="savePatch({ remind_minutes: form.remind_minutes })">
          <el-option label="跟随全局默认" :value="DEFAULT_REMINDER" />
          <el-option label="不提醒" :value="0" />
          <el-option label="提前 5 分钟" :value="5" />
          <el-option label="提前 15 分钟" :value="15" />
          <el-option label="提前 30 分钟" :value="30" />
          <el-option label="提前 1 小时" :value="60" />
          <el-option label="提前 1 天" :value="1440" />
        </el-select>
      </div>
    </div>

    <!-- 重复结束日期 -->
    <div class="field" v-if="form.repeat_type !== 'none'">
      <div class="label">重复结束日期（空 = 永不结束）</div>
      <el-date-picker
        v-model="form.repeat_end"
        type="date"
        placeholder="永不结束"
        size="small"
        style="width: 100%"
        value-format="YYYY-MM-DD"
        clearable
        @change="saveRepeatEnd"
      />
    </div>

    <!-- 分类 / 标签 -->
    <div class="field">
      <div class="label">分类</div>
      <el-select v-model="form.category" size="small" filterable allow-create style="width: 100%" @change="savePatch({ category: form.category })">
        <el-option v-for="c in metaStore.taskCategories" :key="c" :label="c" :value="c" />
      </el-select>
    </div>
    <div class="field">
      <div class="label">标签</div>
      <el-select
        v-model="form.tags" multiple filterable allow-create default-first-option
        size="small" style="width: 100%"
        :reserve-keyword="false" placeholder="输入后回车添加标签"
        @change="savePatch({ tags: form.tags })"
      >
        <el-option v-for="t in metaStore.allTags" :key="t" :label="`#${t}`" :value="t" />
      </el-select>
    </div>

    <!-- 子任务 -->
    <div class="field">
      <div class="label">子任务 <span class="sub-count">{{ doneSubs }}/{{ task.subtasks.length }}</span></div>
      <div v-if="task.subtasks.length" class="subtask-list">
        <div v-for="st in task.subtasks" :key="st.subtask_id" class="subtask-item">
          <el-checkbox :model-value="st.status === 'done'" @change="toggleSub(st.subtask_id)" />
          <span class="st-title" :class="{ done: st.status === 'done' }">{{ st.title }}</span>
          <el-checkbox v-model="st.important" size="small" @change="saveSub">重要</el-checkbox>
          <el-checkbox v-model="st.urgent" size="small" @change="saveSub">紧急</el-checkbox>
          <el-date-picker
            v-model="st.deadline" type="date" size="small" placeholder="截止"
            style="width: 120px" value-format="YYYY-MM-DD" clearable
            @change="saveSub"
          />
          <el-button text size="small" circle class="del-sub" @click="removeSub(st.subtask_id)">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
      <div class="add-sub">
        <el-input v-model="newSub" size="small" placeholder="新增子任务，回车确认" @keyup.enter="addSub">
          <template #append>
            <el-button @click="addSub"><el-icon><Plus /></el-icon></el-button>
          </template>
        </el-input>
      </div>
    </div>

    <!-- 描述 -->
    <div class="field">
      <div class="label">描述 <span class="hint">支持 Markdown</span></div>
      <el-input
        v-model="form.description" type="textarea" :rows="5"
        placeholder="补充任务详情…"
        @blur="savePatch({ description: form.description })"
      />
    </div>

    <!-- 关联 -->
    <div class="field">
      <div class="label">关联日程</div>
      <div v-if="relatedSchedules.length" class="related-list">
        <div v-for="s in relatedSchedules" :key="s.schedule_id" class="related-item" @click="$emit('jump', { type: 'schedule', id: s.schedule_id })">
          <el-icon><Calendar /></el-icon>
          <span>{{ s.title }}</span>
          <span class="time">{{ fmtDateTime(s.start_time) }}</span>
        </div>
      </div>
      <div v-else class="empty-text">暂无关联日程</div>
    </div>
    <div class="field">
      <div class="label">关联笔记</div>
      <div v-if="relatedNotes.length" class="related-list">
        <div v-for="n in relatedNotes" :key="n.note_id" class="related-item" @click="$emit('jump', { type: 'note', id: n.note_id })">
          <el-icon><Notebook /></el-icon>
          <span>{{ n.title }}</span>
          <span class="time">{{ n.folder }}</span>
        </div>
      </div>
      <div v-else class="empty-text">暂无关联笔记</div>
    </div>

    <!-- 元信息 + 删除 -->
    <div class="meta-row">
      <span>创建 {{ fmtDateTime(task.created_at) }}</span>
      <span>更新 {{ fmtDateTime(task.updated_at) }}</span>
    </div>
    <div class="danger-row">
      <el-button type="danger" plain size="small" @click="removeTask"><el-icon><Delete /></el-icon>删除任务</el-button>
    </div>
  </div>
  <el-skeleton v-else :rows="5" animated />
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useTaskStore, getQuadrant } from '@/stores/task'
import { useMetaStore } from '@/stores/meta'
import { useScheduleStore } from '@/stores/schedule'
import { useNoteStore } from '@/stores/note'
import { useUndoStore } from '@/stores/undo'
import { useUiStore } from '@/stores/ui'
import { uuid } from '@/utils/id'
import { fmtDateTime, dayjs } from '@/utils/datetime'

const props = defineProps({ taskId: String })
const emit = defineEmits(['jump'])

const taskStore = useTaskStore()
const metaStore = useMetaStore()
const scheduleStore = useScheduleStore()
const noteStore = useNoteStore()
const undoStore = useUndoStore()
const uiStore = useUiStore()

const statusOptions = [
  { value: 'todo', label: '待开始' },
  { value: 'doing', label: '进行中' },
  { value: 'done', label: '已完成' },
  { value: 'canceled', label: '已取消' }
]

const task = computed(() => taskStore.byId(props.taskId))
const form = reactive({
  title: '', status: 'todo', important: false, urgent: false,
  start_time: null, deadline: null, category: '', tags: [], description: '',
  repeat_type: 'none', repeat_end: null, remind_minutes: null, pinned: false
})

const DEFAULT_REMINDER = '__default__'
const reminderModel = computed({
  get: () => form.remind_minutes == null ? DEFAULT_REMINDER : form.remind_minutes,
  set: value => {
    form.remind_minutes = value === DEFAULT_REMINDER ? null : Number(value)
  }
})
const newSub = ref('')

const quadrantLabel = computed(() => getQuadrant({ important: form.important, urgent: form.urgent }).label)

watch(task, (t) => {
  if (!t) return
  form.title = t.title
  form.status = t.status
  form.important = !!t.important
  form.urgent = !!t.urgent
  form.start_time = t.start_time ? dayjs(t.start_time).format('YYYY-MM-DDTHH:mm:ss') : null
  form.deadline = t.deadline ? dayjs(t.deadline).format('YYYY-MM-DDTHH:mm:ss') : null
  form.category = t.category
  form.tags = [...(t.tags || [])]
  form.description = t.description || ''
  form.repeat_type = t.repeat_type || 'none'
  form.repeat_end = t.repeat_end ? dayjs(t.repeat_end).format('YYYY-MM-DD') : null
  form.remind_minutes = t.remind_minutes ?? null
  form.pinned = !!t.pinned
}, { immediate: true, deep: false })

const doneSubs = computed(() => task.value?.subtasks.filter(s => s.status === 'done').length ?? 0)
const relatedSchedules = computed(() => (task.value?.related_schedule_ids || []).map(id => scheduleStore.byId(id)).filter(Boolean))
const relatedNotes = computed(() => noteStore.linkedToTask(props.taskId))

async function commit(label, patch, undoPatch) {
  const res = await taskStore.updateTask(props.taskId, patch)
  if (!res) return
  undoStore.push({
    label,
    undo: async () => { await taskStore.updateTask(props.taskId, undoPatch || res.before) },
    redo: async () => { await taskStore.updateTask(props.taskId, patch) }
  })
}

function saveTitle() {
  const title = form.title.trim()
  if (!title) { form.title = task.value.title; return }
  commit('修改任务标题', { title })
}

async function saveStatus() {
  const before = task.value
  await taskStore.setStatus(props.taskId, form.status)
  undoStore.push({
    label: `修改状态为${statusOptions.find(s => s.value === form.status)?.label}`,
    undo: async () => taskStore.setStatus(props.taskId, before.status),
    redo: async () => taskStore.setStatus(props.taskId, form.status)
  })
}

function saveStartTime() {
  const st = form.start_time ? dayjs(form.start_time).toISOString() : null
  commit('修改开始时间', { start_time: st }, { start_time: task.value.start_time })
}

function saveDeadline() {
  const deadline = form.deadline ? dayjs(form.deadline).toISOString() : null
  commit('修改截止时间', { deadline }, { deadline: task.value.deadline })
  if (task.value.status === 'delayed' && deadline && deadline > new Date().toISOString()) {
    taskStore.undelayIfNeeded(props.taskId)
  }
}

function saveRepeatEnd() {
  const repeatEnd = form.repeat_end ? dayjs(form.repeat_end).endOf('day').toISOString() : null
  commit('修改重复结束日期', { repeat_end: repeatEnd }, { repeat_end: task.value.repeat_end })
}

function savePatch(patch) {
  const keys = Object.keys(patch)
  const before = {}
  keys.forEach(k => { before[k] = task.value[k] })
  commit(`修改${keys.join('/')}`, patch, before)
}

async function togglePin() {
  const res = await taskStore.togglePin(props.taskId)
  if (res) ElMessage.success(res.pinned ? '已置顶' : '已取消置顶')
}

async function toggleSub(subtaskId) {
  const res = await taskStore.toggleSubtask(props.taskId, subtaskId)
  if (!res) return
  undoStore.push({
    label: '切换子任务',
    undo: async () => taskStore.updateTask(props.taskId, { subtasks: res.task.subtasks }),
    redo: async () => taskStore.updateTask(props.taskId, { subtasks: res.task.subtasks })
  })
  if (res.allDone) {
    ElMessageBox.confirm('所有子任务已完成，是否将主任务标记为完成？', '提示', {
      confirmButtonText: '完成主任务', cancelButtonText: '暂不', type: 'success'
    }).then(async () => {
      await taskStore.setStatus(props.taskId, 'done')
      ElMessage.success('任务已完成')
    }).catch(() => {})
  }
}

function saveSub() {
  const subtasks = JSON.parse(JSON.stringify(task.value.subtasks))
  commit('修改子任务', { subtasks }, { subtasks: task.value.subtasks.map(s => ({ ...s })) })
}

function addSub() {
  const title = newSub.value.trim()
  if (!title) return
  const st = { subtask_id: uuid(), title, status: 'todo', important: false, urgent: false, deadline: null }
  const before = JSON.parse(JSON.stringify(task.value))
  const subtasks = [...task.value.subtasks, st]
  commit('新增子任务', { subtasks }, { subtasks: before.subtasks })
  newSub.value = ''
}

function removeSub(subtaskId) {
  const target = task.value.subtasks.find(s => s.subtask_id === subtaskId)
  if (!target) return
  const before = JSON.parse(JSON.stringify(task.value))
  const subtasks = task.value.subtasks.filter(s => s.subtask_id !== subtaskId)
  commit(`删除子任务「${target.title}」`, { subtasks }, { subtasks: before.subtasks })
}

async function removeTask() {
  try {
    await ElMessageBox.confirm(`确定删除任务「${task.value.title}」吗？删除后可以撤销恢复。`, '删除任务', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消'
    })
  } catch {
    return
  }
  const snapshot = JSON.parse(JSON.stringify(task.value))
  await taskStore.deleteTask(props.taskId)
  uiStore.closeDetail()
  ElMessage.success('任务已删除（可 Ctrl+Z 撤销）')
  undoStore.push({
    label: `删除任务「${snapshot.title}」`,
    undo: async () => taskStore.restoreTask(snapshot),
    redo: async () => taskStore.deleteTask(snapshot.task_id)
  })
}
</script>

<style scoped>
.task-detail { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: 12px; color: var(--pwb-text-secondary); display: flex; align-items: center; gap: 6px; }
.hint { font-weight: 400; }
.title-row { display: flex; align-items: center; gap: 8px; }
.title-row .el-input { flex: 1; }
.sub-count { background: var(--pwb-bg-hover); border-radius: 8px; padding: 0 6px; font-size: 11px; }
.field-row { display: flex; gap: 12px; }
.field-row .field { flex: 1; }

.quadrant-picker { display: flex; align-items: center; gap: 8px; }
.quadrant-hint { font-size: 12px; color: var(--pwb-text-secondary); }

.subtask-list { display: flex; flex-direction: column; gap: 6px; }
.subtask-item {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--pwb-bg-hover);
  flex-wrap: wrap;
}
.subtask-item .st-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subtask-item .done { text-decoration: line-through; color: var(--pwb-text-secondary); }
.del-sub { margin-left: auto; }
.add-sub { margin-top: 6px; }

.related-list { display: flex; flex-direction: column; gap: 4px; }
.related-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--pwb-bg-hover);
  cursor: pointer;
  font-size: 13px;
}
.related-item:hover { background: color-mix(in srgb, var(--pwb-primary) 10%, transparent); }
.related-item .time { margin-left: auto; font-size: 11px; color: var(--pwb-text-secondary); }
.empty-text { font-size: 12px; color: var(--pwb-text-secondary); }

.meta-row {
  display: flex; justify-content: space-between;
  font-size: 11px; color: var(--pwb-text-secondary);
  border-top: 1px solid var(--pwb-border); padding-top: 10px;
}
.danger-row { display: flex; justify-content: flex-end; }
</style>
