<!--
  日程详情面板（PRD 3.2）
  - 全部字段编辑：标题/起止时间/地点/参会人/提醒/重复规则+结束日期/分类/备注(Markdown)/关联任务
  - 编辑重复日程询问「仅本次/全部」（仅本次走 editInstance 生成例外）
  - 删除重复日程询问「仅本次/本次及未来/全部」（走 deleteSchedule 对应 scope）
  - 实时冲突提示（高亮冲突日程，允许保存）；所有变更接入全局撤销栈
-->
<template>
  <div v-if="sch" class="schedule-detail">
    <el-alert
      v-if="instanceDate && isRecurringMaster"
      type="info"
      :closable="false"
      class="instance-alert"
      :title="`正在编辑 ${instanceDate} 的重复日程实例`"
      show-icon
    />
    <el-form label-position="top" size="default" @submit.prevent>
      <el-form-item label="标题">
        <el-input v-model="form.title" maxlength="200" placeholder="日程主题" />
      </el-form-item>

      <el-form-item label="开始时间">
        <el-date-picker
          v-model="form.start_time"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss"
          placeholder="选择开始时间"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="结束时间">
        <el-date-picker
          v-model="form.end_time"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss"
          placeholder="选择结束时间"
          style="width: 100%"
        />
      </el-form-item>

      <!-- 冲突提示：高亮冲突日程，但不阻断保存 -->
      <el-alert
        v-if="conflicts.length"
        type="warning"
        :closable="false"
        class="conflict-alert"
        show-icon
      >
        <template #title>
          与 {{ conflicts.length }} 个日程时间冲突
        </template>
        <div v-for="c in conflicts.slice(0, 5)" :key="c.schedule_id + (c._instance_date || '')" class="conflict-item">
          「{{ c.title }}」{{ fmtDateTime(c.start_time) }} ~ {{ dayjs(c.end_time).format('HH:mm') }}
        </div>
      </el-alert>

      <el-form-item label="地点">
        <el-input v-model="form.location" maxlength="200" placeholder="会议室 / 地址" />
      </el-form-item>

      <el-form-item label="参会人">
        <el-select
          v-model="form.attendees"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入姓名后回车添加"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="提醒">
        <el-select v-model="form.remind_minutes" style="width: 100%">
          <el-option v-for="o in REMIND_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>

      <template v-if="!isException">
        <el-form-item label="重复">
          <el-select v-model="form.repeat_type" style="width: 100%">
            <el-option v-for="o in REPEAT_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.repeat_type !== 'none'" label="重复结束日期">
          <el-date-picker
            v-model="form.repeat_end"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="留空表示一直重复"
            style="width: 100%"
          />
        </el-form-item>
      </template>
      <el-alert
        v-else
        type="info"
        :closable="false"
        class="conflict-alert"
        title="此为重复日程的「仅本次」例外实例，修改不影响其他日期"
      />

      <el-form-item label="分类">
        <el-select v-model="form.category" filterable allow-create default-first-option style="width: 100%">
          <el-option v-for="c in metaStore.scheduleCategories" :key="c" :label="c" :value="c" />
        </el-select>
      </el-form-item>

      <el-form-item label="备注（支持 Markdown）">
        <el-input v-model="form.remark" type="textarea" :rows="4" placeholder="支持 Markdown 语法" />
      </el-form-item>

      <el-form-item label="关联任务">
        <el-select v-model="form.related_task_ids" multiple filterable placeholder="选择要关联的任务" style="width: 100%">
          <el-option v-for="t in taskStore.tasks" :key="t.task_id" :label="t.title" :value="t.task_id" />
        </el-select>
      </el-form-item>

      <!-- 已关联任务：点击可跳转到任务详情 -->
      <div v-if="linkedTasks.length" class="linked-list">
        <div
          v-for="t in linkedTasks"
          :key="t.task_id"
          class="linked-item"
          @click="uiStore.openDetail('task', t.task_id)"
        >
          <QuadrantTag :task="t" />
          <span class="linked-title">{{ t.title }}</span>
          <el-icon class="linked-arrow"><ArrowRight /></el-icon>
        </div>
      </div>

      <!-- 反向展示关联笔记（只读，点击跳转） -->
      <template v-if="linkedNotes.length">
        <div class="section-label">关联笔记</div>
        <div class="linked-list">
          <div
            v-for="n in linkedNotes"
            :key="n.note_id"
            class="linked-item"
            @click="uiStore.openDetail('note', n.note_id)"
          >
            <span class="linked-title">{{ n.title }}</span>
            <el-icon class="linked-arrow"><ArrowRight /></el-icon>
          </div>
        </div>
      </template>

      <div class="meta-info">
        创建于 {{ fmtDateTime(sch.created_at) }} · 更新于 {{ fmtDateTime(sch.updated_at) }}
      </div>

      <div class="actions">
        <el-button type="primary" @click="onSave">保存</el-button>
        <el-button type="danger" plain @click="onDelete">删除</el-button>
      </div>
    </el-form>

    <!-- 编辑重复日程：仅本次 / 全部 -->
    <el-dialog v-model="editScopeVisible" title="编辑重复日程" width="360px" class="mobile-action-sheet" append-to-body>
      <p class="scope-tip">该日程为重复日程，本次修改应用到？</p>
      <template #footer>
        <el-button @click="editScopeVisible = false">取消</el-button>
        <el-button @click="confirmEditScope('this')">仅本次</el-button>
        <el-button type="primary" @click="confirmEditScope('all')">全部</el-button>
      </template>
    </el-dialog>

    <!-- 删除重复日程：仅本次 / 本次及未来 / 全部 -->
    <el-dialog v-model="deleteScopeVisible" title="删除重复日程" width="360px" class="mobile-action-sheet" append-to-body>
      <p class="scope-tip">该日程为重复日程，删除范围？</p>
      <template #footer>
        <el-button @click="deleteScopeVisible = false">取消</el-button>
        <el-button @click="confirmDeleteScope('this')">仅本次</el-button>
        <el-button @click="confirmDeleteScope('future')">本次及未来</el-button>
        <el-button type="danger" @click="confirmDeleteScope('all')">全部</el-button>
      </template>
    </el-dialog>
  </div>

  <el-empty v-else description="日程不存在或已删除" />
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  useScheduleStore,
  expandSchedules,
  scheduleInstanceTimes,
  rebaseRecurringPatchToMaster
} from '@/stores/schedule'
import { useTaskStore } from '@/stores/task'
import { useNoteStore } from '@/stores/note'
import { useMetaStore } from '@/stores/meta'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { findConflicts } from '@/utils/conflict'
import { dayjs, fmtDateTime, dateKey, toISO } from '@/utils/datetime'
import QuadrantTag from '@/components/tasks/QuadrantTag.vue'

const props = defineProps({
  scheduleId: { type: String, required: true },
  instanceDate: { type: String, default: null }
})

const scheduleStore = useScheduleStore()
const taskStore = useTaskStore()
const noteStore = useNoteStore()
const metaStore = useMetaStore()
const uiStore = useUiStore()
const undoStore = useUndoStore()

const REMIND_OPTIONS = [
  { label: '不提醒', value: 0 },
  { label: '提前 5 分钟', value: 5 },
  { label: '提前 15 分钟', value: 15 },
  { label: '提前 30 分钟', value: 30 },
  { label: '提前 1 小时', value: 60 },
  { label: '提前 2 小时', value: 120 },
  { label: '提前 1 天', value: 1440 }
]

const REPEAT_OPTIONS = [
  { label: '不重复', value: 'none' },
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '每月', value: 'monthly' },
  { label: '每年', value: 'yearly' }
]

const sch = computed(() => scheduleStore.byId(props.scheduleId))
/** 是否重复日程主记录 */
const isRecurringMaster = computed(() =>
  sch.value && ['daily', 'weekly', 'monthly', 'yearly'].includes(sch.value.repeat_type)
)
/** 是否例外实例记录 */
const isException = computed(() => sch.value?.repeat_type === 'exception')

/* ---------------- 表单 ---------------- */

const form = reactive({
  title: '',
  start_time: '',
  end_time: '',
  location: '',
  attendees: [],
  remind_minutes: 15,
  repeat_type: 'none',
  repeat_end: null,
  category: '默认',
  remark: '',
  related_task_ids: []
})

/** 日程切换时重置表单（时间选择器使用 YYYY-MM-DDTHH:mm:ss 本地格式） */
watch(() => [props.scheduleId, props.instanceDate], () => {
  const s = sch.value
  if (!s) return
  const instanceTimes = props.instanceDate && ['daily', 'weekly', 'monthly', 'yearly'].includes(s.repeat_type)
    ? scheduleInstanceTimes(s, props.instanceDate)
    : { start_time: s.start_time, end_time: s.end_time }
  form.title = s.title
  form.start_time = dayjs(instanceTimes.start_time).format('YYYY-MM-DDTHH:mm:ss')
  form.end_time = dayjs(instanceTimes.end_time).format('YYYY-MM-DDTHH:mm:ss')
  form.location = s.location || ''
  form.attendees = [...(s.attendees || [])]
  form.remind_minutes = s.remind_minutes ?? 15
  form.repeat_type = isException.value ? 'none' : s.repeat_type
  form.repeat_end = s.repeat_end ? dateKey(s.repeat_end) : null
  form.category = s.category || '默认'
  form.remark = s.remark || ''
  form.related_task_ids = [...(s.related_task_ids || [])]
}, { immediate: true })

const linkedTasks = computed(() =>
  form.related_task_ids.map(id => taskStore.byId(id)).filter(Boolean)
)
const linkedNotes = computed(() => noteStore.linkedToSchedule(props.scheduleId))

/* ---------------- 冲突检测 ---------------- */

/** 表单时间对应的冲突日程（排除自身及同主实例） */
const conflicts = computed(() => {
  if (!form.start_time || !form.end_time || !sch.value) return []
  const target = {
    schedule_id: props.scheduleId,
    start_time: toISO(form.start_time),
    end_time: toISO(form.end_time)
  }
  if (dayjs(target.end_time) <= dayjs(target.start_time)) return []
  const candidates = expandSchedules(
    scheduleStore.schedules,
    dayjs(target.start_time).subtract(1, 'day').toISOString(),
    dayjs(target.end_time).add(1, 'day').toISOString()
  ).filter(s => s.schedule_id !== props.scheduleId && s._master_id !== props.scheduleId)
  return findConflicts(target, candidates)
})

/* ---------------- 重复日程「本次」实例日期 ---------------- */

/** 取离今天最近的一个实例日期（编辑/删除「仅本次」时使用） */
function nearestInstanceDate(master) {
  const now = dayjs()
  const insts = expandSchedules(
    scheduleStore.schedules,
    now.subtract(1, 'year').toISOString(),
    now.add(1, 'year').toISOString()
  ).filter(s => s._master_id === master.schedule_id)
  if (!insts.length) return dateKey(master.start_time)
  let best = insts[0]
  let bestDiff = Math.abs(dayjs(insts[0].start_time).diff(now))
  for (const inst of insts) {
    const d = Math.abs(dayjs(inst.start_time).diff(now))
    if (d < bestDiff) { best = inst; bestDiff = d }
  }
  return best._instance_date
}

/* ---------------- 保存 ---------------- */

const editScopeVisible = ref(false)
let pendingPatch = null

function buildPatch() {
  return {
    title: form.title.trim(),
    start_time: toISO(form.start_time),
    end_time: toISO(form.end_time),
    location: form.location.trim(),
    attendees: [...form.attendees],
    remind_minutes: form.remind_minutes,
    repeat_type: isException.value ? 'exception' : form.repeat_type,
    repeat_end: (!isException.value && form.repeat_type !== 'none' && form.repeat_end)
      ? dayjs(form.repeat_end).endOf('day').toISOString()
      : null,
    category: form.category || '默认',
    remark: form.remark,
    related_task_ids: [...form.related_task_ids]
  }
}

async function onSave() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写日程标题')
    return
  }
  if (!form.start_time || !form.end_time || dayjs(form.end_time) <= dayjs(form.start_time)) {
    ElMessage.warning('结束时间必须晚于开始时间')
    return
  }
  const patch = buildPatch()
  // 新分类自动登记到元数据
  if (form.category && !metaStore.scheduleCategories.includes(form.category)) {
    await metaStore.addCategory(form.category, 'schedule')
  }
  if (isRecurringMaster.value) {
    // 重复日程：询问应用范围
    pendingPatch = patch
    editScopeVisible.value = true
    return
  }
  await commitAll(patch)
}

/** 应用到全部：整体更新主记录，并同步任务侧反向关联 */
async function commitAll(patch) {
  patch = rebaseRecurringPatchToMaster(sch.value, props.instanceDate, patch)
  const oldTaskIds = sch.value.related_task_ids || []
  const res = await scheduleStore.updateSchedule(props.scheduleId, patch)
  if (!res) return
  const taskSnapshots = await syncRelatedTasks(oldTaskIds, patch.related_task_ids)
  const before = res.before
  undoStore.push({
    label: `修改日程「${patch.title}」`,
    undo: async () => {
      await scheduleStore.updateSchedule(props.scheduleId, before)
      for (const snap of taskSnapshots) await taskStore.updateTask(snap.task_id, snap)
    },
    redo: async () => {
      await scheduleStore.updateSchedule(props.scheduleId, patch)
      for (const snap of taskSnapshots) {
        const t = taskStore.byId(snap.task_id)
        if (!t) continue
        const ids = new Set(t.related_schedule_ids)
        if (patch.related_task_ids.includes(snap.task_id)) ids.add(props.scheduleId)
        else ids.delete(props.scheduleId)
        await taskStore.updateTask(snap.task_id, { related_schedule_ids: [...ids] })
      }
    }
  })
  afterSave()
}

/** 应用到仅本次：生成例外实例（剔除 repeat 字段，防止覆盖 exception 标记） */
async function commitInstance(patch) {
  const instanceDate = props.instanceDate || nearestInstanceDate(sch.value)
  const instPatch = { ...patch }
  delete instPatch.repeat_type
  delete instPatch.repeat_end
  const inst = await scheduleStore.editInstance(props.scheduleId, instanceDate, instPatch)
  if (!inst) return
  undoStore.push({
    label: `修改日程「${patch.title}」（仅本次）`,
    undo: async () => { await scheduleStore.deleteSchedule(inst.schedule_id) },
    redo: async () => { await scheduleStore.restoreSchedule(inst) }
  })
  afterSave()
}

async function confirmEditScope(scope) {
  editScopeVisible.value = false
  const patch = pendingPatch
  pendingPatch = null
  if (!patch) return
  if (scope === 'this') await commitInstance(patch)
  else await commitAll(patch)
}

/** 同步任务侧的 related_schedule_ids 反向关联，返回受影响任务快照（供撤销） */
async function syncRelatedTasks(oldIds, newIds) {
  const snapshots = []
  const affected = new Set([...oldIds, ...newIds])
  for (const tid of affected) {
    const t = taskStore.byId(tid)
    if (!t) continue
    snapshots.push(JSON.parse(JSON.stringify(t)))
    const ids = new Set(t.related_schedule_ids || [])
    if (newIds.includes(tid)) ids.add(props.scheduleId)
    else ids.delete(props.scheduleId)
    if (ids.size !== (t.related_schedule_ids || []).length || ![...ids].every(x => (t.related_schedule_ids || []).includes(x))) {
      await taskStore.updateTask(tid, { related_schedule_ids: [...ids] })
    }
  }
  return snapshots
}

function afterSave() {
  if (conflicts.value.length) {
    ElMessage.warning(`已保存，但与 ${conflicts.value.length} 个日程存在时间冲突`)
  } else {
    ElMessage.success('日程已保存')
  }
}

/* ---------------- 删除 ---------------- */

const deleteScopeVisible = ref(false)

async function onDelete() {
  if (isRecurringMaster.value) {
    deleteScopeVisible.value = true
    return
  }
  try {
    await ElMessageBox.confirm('确定删除该日程吗？', '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch {
    return // 用户取消
  }
  await doDelete('all', null)
}

async function confirmDeleteScope(scope) {
  deleteScopeVisible.value = false
  await doDelete(scope, props.instanceDate || nearestInstanceDate(sch.value))
}

async function doDelete(scope, instanceDate) {
  const snapshot = JSON.parse(JSON.stringify(sch.value))
  await scheduleStore.deleteSchedule(props.scheduleId, scope, instanceDate)
  undoStore.push({
    label: `删除日程「${snapshot.title}」`,
    undo: async () => {
      // scope=this/future 仅修改主记录（canceled_dates/repeat_end），记录仍在 → 回滚字段；
      // scope=all 记录被物理删除 → 用 restore 恢复
      if (scheduleStore.byId(snapshot.schedule_id)) {
        await scheduleStore.updateSchedule(snapshot.schedule_id, snapshot)
      } else {
        await scheduleStore.restoreSchedule(snapshot)
      }
    },
    redo: async () => { await scheduleStore.deleteSchedule(snapshot.schedule_id, scope, instanceDate) }
  })
  ElMessage.success('日程已删除')
  if (scope === 'all') uiStore.closeDetail()
}
</script>

<style scoped>
.schedule-detail { padding-bottom: 16px; }
.conflict-alert, .instance-alert { margin-bottom: 16px; }
.conflict-item {
  font-size: 12px;
  line-height: 1.8;
}
.linked-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: -8px 0 16px;
}
.linked-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--pwb-radius);
  cursor: pointer;
  font-size: 13px;
}
.linked-item:hover { background: var(--pwb-bg-hover); }
.linked-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.linked-arrow { color: var(--pwb-text-secondary); }
.section-label {
  font-size: 13px;
  color: var(--pwb-text-secondary);
  margin-bottom: 8px;
}
.meta-info {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  margin: 8px 0 16px;
}
.actions {
  display: flex;
  gap: 8px;
}
.scope-tip { margin: 0 0 8px; }
</style>
