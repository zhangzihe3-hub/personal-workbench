<!--
  目标管理面板（PRD 3.6.1）
  - 目标卡片网格：标题、周期标签（week/month/quarter/year 中文）、描述、衡量标准 metric、
    截止时间、goalProgress 进度条、状态标签、KR 列表可勾选（勾选完成计入进度）
  - 新建/编辑弹窗：标题 / 周期 / 描述 / 衡量标准 / 截止时间 / KR 动态增删（KR 可多选关联任务）
  - 删除二次确认 + 撤销（恢复走 addGoal 重建，保留全部字段）
  所有增删改接入全局撤销栈
-->
<template>
  <div class="goal-panel">
    <div class="panel-toolbar">
      <el-button type="primary" size="small" @click="openDialog()">
        <el-icon><Plus /></el-icon>新建目标
      </el-button>
    </div>

    <div v-if="goalStore.goals.length" class="goal-grid">
      <div v-for="g in goalStore.goals" :key="g.goal_id" class="goal-card pwb-card">
        <div class="goal-head">
          <span class="goal-title" :title="g.title">{{ g.title }}</span>
          <el-tag size="small" effect="plain">{{ PERIOD_LABEL[g.period] || g.period }}</el-tag>
          <el-tag size="small" :type="g.status === 'done' ? 'success' : 'primary'">
            {{ g.status === 'done' ? '已完成' : '进行中' }}
          </el-tag>
        </div>
        <div v-if="g.description" class="goal-desc">{{ g.description }}</div>
        <div class="goal-meta">
          <span v-if="g.metric">衡量标准：{{ g.metric }}</span>
          <span v-if="g.deadline">截止：{{ fmtDate(g.deadline) }}</span>
        </div>
        <el-progress
          :percentage="goalStore.goalProgress(g)"
          :status="g.status === 'done' ? 'success' : undefined"
        />

        <!-- 关键结果（可勾选完成） -->
        <div v-if="(g.key_results || []).length" class="kr-list">
          <div v-for="kr in g.key_results" :key="kr.kr_id" class="kr-item">
            <el-checkbox
              :model-value="kr.done"
              @change="toggleKr(g, kr)"
            >
              <span :class="{ 'kr-done': kr.done }">{{ kr.title }}</span>
            </el-checkbox>
            <span v-if="(kr.related_task_ids || []).length" class="kr-tasks">
              关联 {{ kr.related_task_ids.length }} 个任务
            </span>
          </div>
        </div>

        <div class="goal-actions">
          <el-button text size="small" @click="toggleStatus(g)">
            {{ g.status === 'done' ? '重新开启' : '标记完成' }}
          </el-button>
          <el-button text size="small" type="primary" @click="openDialog(g)">
            <el-icon><EditPen /></el-icon>编辑
          </el-button>
          <el-button text size="small" type="danger" @click="removeGoal(g)">
            <el-icon><Delete /></el-icon>删除
          </el-button>
        </div>
      </div>
    </div>
    <div v-else class="empty-box">
      <el-empty :image-size="96" description="还没有目标，设定一个周期目标开始追踪吧">
        <el-button type="primary" size="small" @click="openDialog()">新建目标</el-button>
      </el-empty>
    </div>

    <!-- 新建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible" :title="editingGoal ? '编辑目标' : '新建目标'"
      width="560px" class="mobile-page-dialog" destroy-on-close
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="目标标题" required>
          <el-input v-model="form.title" maxlength="200" placeholder="如：本季度完成产品 V2 发布" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="周期">
            <el-select v-model="form.period" style="width: 100%">
              <el-option v-for="(label, v) in PERIOD_LABEL" :key="v" :label="label" :value="v" />
            </el-select>
          </el-form-item>
          <el-form-item label="截止时间">
            <el-date-picker
              v-model="form.deadline" type="date" value-format="YYYY-MM-DD"
              placeholder="选择截止日期" style="width: 100%"
            />
          </el-form-item>
        </div>
        <el-form-item label="目标描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" placeholder="目标背景与说明" />
        </el-form-item>
        <el-form-item label="衡量标准">
          <el-input v-model="form.metric" maxlength="200" placeholder="如：发布 3 个大版本，崩溃率 < 0.1%" />
        </el-form-item>

        <el-form-item label="关键结果（KR）">
          <div class="kr-edit-list">
            <div v-for="(kr, idx) in form.key_results" :key="kr.kr_id" class="kr-edit-row">
              <el-checkbox v-model="kr.done" title="是否完成" />
              <el-input v-model="kr.title" size="small" maxlength="200" placeholder="KR 标题" style="flex: 1" />
              <el-select
                v-model="kr.related_task_ids" multiple filterable collapse-tags
                size="small" placeholder="关联任务" style="width: 200px"
              >
                <el-option v-for="t in taskStore.tasks" :key="t.task_id" :label="t.title" :value="t.task_id" />
              </el-select>
              <el-button text circle size="small" type="danger" @click="form.key_results.splice(idx, 1)">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
            <el-button text size="small" type="primary" @click="addKrRow">
              <el-icon><Plus /></el-icon>添加关键结果
            </el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGoal">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useGoalStore } from '@/stores/goal'
import { useTaskStore } from '@/stores/task'
import { useUndoStore } from '@/stores/undo'
import { dayjs, fmtDate, toISO } from '@/utils/datetime'
import { uuid } from '@/utils/id'

const goalStore = useGoalStore()
const taskStore = useTaskStore()
const undoStore = useUndoStore()

/** 周期中文标签（PRD：周/月/季度/年度） */
const PERIOD_LABEL = { week: '周目标', month: '月目标', quarter: '季度目标', year: '年度目标' }

/* ---------------- 弹窗表单 ---------------- */
const dialogVisible = ref(false)
const editingGoal = ref(null)
const form = reactive({
  title: '', period: 'month', deadline: '', description: '', metric: '', key_results: []
})

function openDialog(goal = null) {
  editingGoal.value = goal
  if (goal) {
    form.title = goal.title
    form.period = goal.period
    form.deadline = goal.deadline ? dayjs(goal.deadline).format('YYYY-MM-DD') : ''
    form.description = goal.description
    form.metric = goal.metric
    form.key_results = (goal.key_results || []).map(kr => ({
      kr_id: kr.kr_id, title: kr.title, done: !!kr.done,
      related_task_ids: [...(kr.related_task_ids || [])]
    }))
  } else {
    form.title = ''
    form.period = 'month'
    form.deadline = ''
    form.description = ''
    form.metric = ''
    form.key_results = []
  }
  dialogVisible.value = true
}

function addKrRow() {
  form.key_results.push({ kr_id: uuid(), title: '', done: false, related_task_ids: [] })
}

/** 保存：新增或更新，均接入撤销栈 */
async function saveGoal() {
  if (!form.title.trim()) { ElMessage.warning('请填写目标标题'); return }
  const data = {
    title: form.title.trim(),
    period: form.period,
    deadline: form.deadline ? toISO(form.deadline) : null,
    description: form.description.trim(),
    metric: form.metric.trim(),
    key_results: form.key_results
      .filter(kr => kr.title.trim())
      .map(kr => ({ kr_id: kr.kr_id, title: kr.title.trim(), done: !!kr.done, related_task_ids: [...(kr.related_task_ids || [])] }))
  }
  if (editingGoal.value) {
    const goal = editingGoal.value
    const before = JSON.parse(JSON.stringify({
      title: goal.title, period: goal.period, deadline: goal.deadline,
      description: goal.description, metric: goal.metric, key_results: goal.key_results
    }))
    await goalStore.updateGoal(goal.goal_id, data)
    undoStore.push({
      label: '编辑目标',
      undo: async () => { await goalStore.updateGoal(goal.goal_id, before) },
      redo: async () => { await goalStore.updateGoal(goal.goal_id, data) }
    })
    ElMessage.success('目标已更新')
  } else {
    const goal = await goalStore.addGoal(data)
    undoStore.push({
      label: '新建目标',
      undo: async () => { await goalStore.deleteGoal(goal.goal_id) },
      redo: async () => { await goalStore.addGoal(data) }
    })
    ElMessage.success('目标已创建')
  }
  dialogVisible.value = false
}

/* ---------------- KR 勾选（计入 goalProgress 完成度） ---------------- */
async function toggleKr(goal, kr) {
  const before = JSON.parse(JSON.stringify(goal.key_results))
  const after = goal.key_results.map(x => x.kr_id === kr.kr_id ? { ...x, done: !x.done } : x)
  await goalStore.updateGoal(goal.goal_id, { key_results: after })
  undoStore.push({
    label: kr.done ? '取消完成 KR' : '完成 KR',
    undo: async () => { await goalStore.updateGoal(goal.goal_id, { key_results: before }) },
    redo: async () => { await goalStore.updateGoal(goal.goal_id, { key_results: after }) }
  })
}

/* ---------------- 状态切换 ---------------- */
async function toggleStatus(goal) {
  const oldStatus = goal.status // 先快照，updateGoal 会就地修改对象
  const newStatus = oldStatus === 'done' ? 'active' : 'done'
  await goalStore.updateGoal(goal.goal_id, { status: newStatus })
  undoStore.push({
    label: newStatus === 'done' ? '完成目标' : '重新开启目标',
    undo: async () => { await goalStore.updateGoal(goal.goal_id, { status: oldStatus }) },
    redo: async () => { await goalStore.updateGoal(goal.goal_id, { status: newStatus }) }
  })
  ElMessage.success(newStatus === 'done' ? '目标已标记完成' : '目标已重新开启')
}

/* ---------------- 删除（确认 + 撤销） ---------------- */
async function removeGoal(goal) {
  try {
    await ElMessageBox.confirm(`确定删除目标「${goal.title}」吗？删除后可通过撤销恢复。`, '删除目标', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
    })
  } catch { return }
  const snapshot = JSON.parse(JSON.stringify(goal))
  await goalStore.deleteGoal(goal.goal_id)
  // 撤销恢复时 addGoal 会生成新 goal_id，需跟踪以便重做再次删除
  let currentId = goal.goal_id
  undoStore.push({
    label: '删除目标',
    undo: async () => { const g = await goalStore.addGoal(snapshot); currentId = g.goal_id },
    redo: async () => { await goalStore.deleteGoal(currentId) }
  })
  ElMessage.success('已删除，可通过 Ctrl+Z 撤销')
}
</script>

<style scoped>
.goal-panel { display: flex; flex-direction: column; gap: 16px; }
.panel-toolbar { display: flex; justify-content: flex-end; }
.goal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.goal-card { display: flex; flex-direction: column; gap: 8px; }
.goal-head { display: flex; align-items: center; gap: 8px; }
.goal-title { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.goal-desc { font-size: 13px; color: var(--pwb-text-secondary); line-height: 1.5; }
.goal-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--pwb-text-secondary); }
.kr-list { display: flex; flex-direction: column; gap: 4px; }
.kr-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kr-done { text-decoration: line-through; color: var(--pwb-text-secondary); }
.kr-tasks { font-size: 12px; color: var(--pwb-text-secondary); white-space: nowrap; }
.goal-actions { display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--pwb-border); padding-top: 8px; }
.empty-box { padding: 32px 0; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.kr-edit-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.kr-edit-row { display: flex; align-items: center; gap: 8px; }
</style>
