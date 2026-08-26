<!--
  习惯打卡面板（PRD 3.6.2）
  - 习惯卡片：名称、频率描述（每日/每周X天）、提醒时间、连续天数 streak（火焰标识）、本周打卡率
  - 今日打卡大按钮：toggleCheckIn(habitId)（幂等，再次点击取消）
  - 近 30 天打卡日历：纯 CSS 格子矩阵（15 列 x 2 行），有记录高亮，
    点击格子 toggleCheckIn(habitId, 'YYYY-MM-DD') 补打卡 / 取消
  - 新建/编辑/删除弹窗（名称 / 每日或每周X天多选 / 提醒时间）
  所有增删改接入全局撤销栈
-->
<template>
  <div class="habit-panel">
    <div class="panel-toolbar">
      <el-button type="primary" size="small" @click="openDialog()">
        <el-icon><Plus /></el-icon>新建习惯
      </el-button>
    </div>

    <div v-if="goalStore.habits.length" class="habit-grid">
      <div v-for="h in goalStore.habits" :key="h.habit_id" class="habit-card pwb-card">
        <div class="habit-head">
          <span class="habit-title" :title="h.title">{{ h.title }}</span>
          <span class="streak" :class="{ hot: goalStore.streak(h.habit_id) > 0 }" title="连续打卡天数">
            <span class="flame">🔥</span>{{ goalStore.streak(h.habit_id) }} 天
          </span>
        </div>
        <div class="habit-meta">
          <span>{{ frequencyDesc(h) }}</span>
          <span v-if="h.remind_time">提醒 {{ h.remind_time }}</span>
          <span>本周打卡率 {{ weekRate(h) }}%</span>
        </div>

        <!-- 近 30 天打卡日历（纯 CSS 格子矩阵） -->
        <div class="heatmap" :title="'近 30 天打卡记录，点击格子可补打/取消'">
          <span
            v-for="cell in heatmapCells(h)" :key="cell.date"
            class="heat-cell" :class="{ checked: cell.checked, today: cell.isToday, future: cell.future }"
            :title="`${cell.date}${cell.checked ? ' 已打卡' : ''}`"
            @click="toggleDay(h, cell)"
          ></span>
        </div>

        <div class="habit-actions">
          <el-button
            size="small" :type="goalStore.isCheckedToday(h.habit_id) ? 'success' : 'primary'"
            :plain="goalStore.isCheckedToday(h.habit_id)"
            @click="checkToday(h)"
          >
            <el-icon><Check /></el-icon>
            {{ goalStore.isCheckedToday(h.habit_id) ? '今日已打卡（点击取消）' : '今日打卡' }}
          </el-button>
          <el-button text size="small" type="primary" @click="openDialog(h)">
            <el-icon><EditPen /></el-icon>编辑
          </el-button>
          <el-button text size="small" type="danger" @click="removeHabit(h)">
            <el-icon><Delete /></el-icon>删除
          </el-button>
        </div>
      </div>
    </div>
    <div v-else class="empty-box">
      <el-empty :image-size="96" description="还没有习惯，创建一个开始每日打卡吧">
        <el-button type="primary" size="small" @click="openDialog()">新建习惯</el-button>
      </el-empty>
    </div>

    <!-- 新建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible" :title="editingHabit ? '编辑习惯' : '新建习惯'"
      width="480px" class="mobile-page-dialog" destroy-on-close
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="习惯名称" required>
          <el-input v-model="form.title" maxlength="100" placeholder="如：每天阅读 30 分钟" />
        </el-form-item>
        <el-form-item label="打卡频率">
          <el-radio-group v-model="form.frequency_type">
            <el-radio-button value="daily">每天</el-radio-button>
            <el-radio-button value="weekly">每周指定天</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.frequency_type === 'weekly'" label="每周打卡日">
          <el-select v-model="form.weekly_days" multiple style="width: 100%" placeholder="选择星期几">
            <el-option v-for="d in WEEK_OPTIONS" :key="d.value" :label="d.label" :value="d.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="提醒时间">
          <el-time-picker
            v-model="form.remind_time" format="HH:mm" value-format="HH:mm"
            placeholder="选择提醒时间" style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveHabit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useGoalStore } from '@/stores/goal'
import { useUndoStore } from '@/stores/undo'
import { dayjs, dateKey } from '@/utils/datetime'

const goalStore = useGoalStore()
const undoStore = useUndoStore()

/** 1=周一 … 7=周日（与 store 默认 weekly_days [1..5] 对齐） */
const WEEK_OPTIONS = [
  { value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' },
  { value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' },
  { value: 7, label: '周日' }
]

/* ---------------- 展示辅助 ---------------- */
function frequencyDesc(h) {
  if (h.frequency_type === 'weekly') {
    const names = (h.weekly_days || [])
      .slice()
      .sort((a, b) => a - b)
      .map(d => WEEK_OPTIONS.find(w => w.value === d)?.label || d)
    return names.length ? `每周 ${names.join('、')}` : '每周（未设置打卡日）'
  }
  return '每天'
}

/** 本周打卡率：已打卡天数 / 目标天数（daily=7，weekly=weekly_days 个数），封顶 100% */
function weekRate(h) {
  const weekStart = dayjs().startOf('isoWeek')
  const weekEnd = dayjs().endOf('isoWeek')
  const checked = new Set(
    goalStore.logsOf(h.habit_id)
      .filter(l => {
        const d = dayjs(l.date)
        return !d.isBefore(weekStart) && !d.isAfter(weekEnd)
      })
      .map(l => l.date)
  ).size
  const target = h.frequency_type === 'weekly' ? Math.max((h.weekly_days || []).length, 1) : 7
  return Math.min(100, Math.round((checked / target) * 100))
}

/** 近 30 天打卡日历数据（含今天，未来日期不可点击） */
function heatmapCells(h) {
  const logs = new Set(goalStore.logsOf(h.habit_id).map(l => l.date))
  const today = dayjs().startOf('day')
  const cells = []
  for (let i = 29; i >= 0; i--) {
    const d = today.subtract(i, 'day')
    const key = d.format('YYYY-MM-DD')
    cells.push({
      date: key,
      checked: logs.has(key),
      isToday: i === 0,
      future: d.isAfter(today)
    })
  }
  return cells
}

/* ---------------- 打卡 ---------------- */
async function checkToday(h) {
  const checked = await goalStore.toggleCheckIn(h.habit_id)
  const date = dateKey(new Date())
  undoStore.push({
    label: checked ? `打卡「${h.title}」` : `取消打卡「${h.title}」`,
    undo: async () => { await goalStore.toggleCheckIn(h.habit_id, date) },
    redo: async () => { await goalStore.toggleCheckIn(h.habit_id, date) }
  })
  ElMessage.success(checked ? '打卡成功，继续保持' : '已取消今日打卡')
}

/** 热力格点击：补打/取消指定日期 */
async function toggleDay(h, cell) {
  if (cell.future) return
  const checked = await goalStore.toggleCheckIn(h.habit_id, cell.date)
  undoStore.push({
    label: checked ? `补打卡「${h.title}」` : `取消打卡「${h.title}」`,
    undo: async () => { await goalStore.toggleCheckIn(h.habit_id, cell.date) },
    redo: async () => { await goalStore.toggleCheckIn(h.habit_id, cell.date) }
  })
  ElMessage.success(checked ? `已补打 ${cell.date}` : `已取消 ${cell.date} 打卡`)
}

/* ---------------- 新建 / 编辑 ---------------- */
const dialogVisible = ref(false)
const editingHabit = ref(null)
const form = reactive({ title: '', frequency_type: 'daily', weekly_days: [1, 2, 3, 4, 5], remind_time: '20:00' })

function openDialog(habit = null) {
  editingHabit.value = habit
  form.title = habit ? habit.title : ''
  form.frequency_type = habit ? habit.frequency_type : 'daily'
  form.weekly_days = habit ? [...(habit.weekly_days || [])] : [1, 2, 3, 4, 5]
  form.remind_time = habit ? habit.remind_time : '20:00'
  dialogVisible.value = true
}

async function saveHabit() {
  if (!form.title.trim()) { ElMessage.warning('请填写习惯名称'); return }
  if (form.frequency_type === 'weekly' && !form.weekly_days.length) {
    ElMessage.warning('请选择每周打卡日')
    return
  }
  const data = {
    title: form.title.trim(),
    frequency_type: form.frequency_type,
    weekly_days: [...form.weekly_days].sort((a, b) => a - b),
    remind_time: form.remind_time || '20:00'
  }
  if (editingHabit.value) {
    const habit = editingHabit.value
    const before = JSON.parse(JSON.stringify({
      title: habit.title, frequency_type: habit.frequency_type,
      weekly_days: habit.weekly_days, remind_time: habit.remind_time
    }))
    await goalStore.updateHabit(habit.habit_id, data)
    undoStore.push({
      label: '编辑习惯',
      undo: async () => { await goalStore.updateHabit(habit.habit_id, before) },
      redo: async () => { await goalStore.updateHabit(habit.habit_id, data) }
    })
    ElMessage.success('习惯已更新')
  } else {
    const habit = await goalStore.addHabit(data)
    undoStore.push({
      label: '新建习惯',
      undo: async () => { await goalStore.deleteHabit(habit.habit_id) },
      redo: async () => { await goalStore.addHabit(data) }
    })
    ElMessage.success('习惯已创建')
  }
  dialogVisible.value = false
}

/* ---------------- 删除（确认 + 撤销） ---------------- */
async function removeHabit(h) {
  const logCount = goalStore.logsOf(h.habit_id).length
  try {
    await ElMessageBox.confirm(
      `确定删除习惯「${h.title}」吗？将同时删除 ${logCount} 条打卡记录。删除后可通过撤销恢复习惯（打卡记录不可恢复）。`,
      '删除习惯',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }
  const snapshot = JSON.parse(JSON.stringify(h))
  await goalStore.deleteHabit(h.habit_id)
  // 撤销恢复时 addHabit 会生成新 habit_id，需跟踪以便重做再次删除
  let currentId = h.habit_id
  undoStore.push({
    label: '删除习惯',
    undo: async () => { const nh = await goalStore.addHabit(snapshot); currentId = nh.habit_id },
    redo: async () => { await goalStore.deleteHabit(currentId) }
  })
  ElMessage.success('已删除，可通过 Ctrl+Z 撤销')
}
</script>

<style scoped>
.habit-panel { display: flex; flex-direction: column; gap: 16px; }
.panel-toolbar { display: flex; justify-content: flex-end; }
.habit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.habit-card { display: flex; flex-direction: column; gap: 8px; }
.habit-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.habit-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.streak { font-size: 13px; color: var(--pwb-text-secondary); white-space: nowrap; }
.streak.hot { color: #f56c6c; font-weight: 600; }
.flame { margin-right: 4px; }
.habit-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12px; color: var(--pwb-text-secondary); }

/* 近 30 天打卡日历：15 列 x 2 行，纯 CSS 格子矩阵 */
.heatmap {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 4px;
}
.heat-cell {
  aspect-ratio: 1;
  border-radius: 3px;
  background: var(--pwb-bg-hover);
  cursor: pointer;
  border: 1px solid var(--pwb-border);
}
.heat-cell.checked { background: var(--pwb-primary); border-color: var(--pwb-primary); }
.heat-cell.today { outline: 1px dashed var(--pwb-p1); outline-offset: 1px; }
.heat-cell.future { opacity: 0.4; cursor: not-allowed; }
.heat-cell:not(.future):hover { transform: scale(1.15); }

.habit-actions { display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--pwb-border); padding-top: 8px; }
.empty-box { padding: 32px 0; }
</style>
