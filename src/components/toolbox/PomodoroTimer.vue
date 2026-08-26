<!--
  番茄钟（PRD 3.5.1）
  - SVG 圆形倒计时表盘：stroke-dasharray / stroke-dashoffset 进度环动画
  - 工作/休息时长读取 settingsStore.settings.pomodoroWork / pomodoroBreak，可在页面内临时调整（不写回设置）
  - 开始 / 暂停 / 重置；工作时段完成时调用 toolboxStore.logFocus({taskId, minutes}) 计入统计，并 ElNotification 提示休息
  - 可选关联活动任务（taskStore.activeTasks 下拉）
  - 专注模式：全屏遮罩只显示表盘 + 剩余时间，Esc 退出（window 捕获监听兜底）
  - 展示今日 / 累计专注分钟数
-->
<template>
  <div class="pomodoro">
    <!-- 表盘 -->
    <div class="dial-wrap">
      <svg class="dial" viewBox="0 0 200 200">
        <circle class="dial-bg" cx="100" cy="100" :r="R" />
        <circle
          class="dial-progress" :class="mode" cx="100" cy="100" :r="R"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="dashOffset"
        />
      </svg>
      <div class="dial-center">
        <div class="dial-time">{{ displayTime }}</div>
        <div class="dial-mode">{{ mode === 'work' ? '专注中' : '休息中' }}<span v-if="!running && remaining === totalSeconds"> · 待开始</span></div>
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="controls">
      <el-button v-if="!running" type="primary" round @click="start">
        <el-icon><VideoPlay /></el-icon>开始
      </el-button>
      <el-button v-else type="warning" round @click="pause">
        <el-icon><VideoPause /></el-icon>暂停
      </el-button>
      <el-button round @click="reset">
        <el-icon><RefreshLeft /></el-icon>重置
      </el-button>
      <el-button round @click="enterFocusMode">
        <el-icon><FullScreen /></el-icon>专注模式
      </el-button>
    </div>

    <!-- 设置区：时长临时调整 + 关联任务 -->
    <div class="pomodoro-settings">
      <div class="setting-item">
        <span class="setting-label">工作</span>
        <el-input-number v-model="workMinutes" :min="1" :max="120" size="small" :disabled="running" @change="onDurationChange" />
        <span class="setting-unit">分钟</span>
      </div>
      <div class="setting-item">
        <span class="setting-label">休息</span>
        <el-input-number v-model="breakMinutes" :min="1" :max="60" size="small" :disabled="running" @change="onDurationChange" />
        <span class="setting-unit">分钟</span>
      </div>
      <div class="setting-item full">
        <span class="setting-label">关联任务</span>
        <el-select
          v-model="linkedTaskId" size="small" clearable filterable
          placeholder="选择要专注的任务（可选）" style="flex: 1"
        >
          <el-option v-for="t in taskStore.activeTasks" :key="t.task_id" :label="t.title" :value="t.task_id" />
        </el-select>
      </div>
    </div>

    <!-- 统计 -->
    <div class="focus-stats">
      <div class="stat-item">
        <div class="stat-value">{{ toolboxStore.todayFocusMinutes }}</div>
        <div class="stat-label">今日专注（分钟）</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ toolboxStore.totalFocusMinutes }}</div>
        <div class="stat-label">累计专注（分钟）</div>
      </div>
    </div>

    <!-- 专注模式全屏遮罩：只显示表盘 + 剩余时间（Esc 退出） -->
    <teleport to="body">
      <div v-if="focusMode" class="focus-overlay" tabindex="0" ref="overlayRef">
        <div class="focus-mode-label">{{ mode === 'work' ? '保持专注' : '放松一下' }}</div>
        <div class="focus-dial-wrap">
          <svg class="dial" viewBox="0 0 200 200">
            <circle class="dial-bg" cx="100" cy="100" :r="R" />
            <circle
              class="dial-progress" :class="mode" cx="100" cy="100" :r="R"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="dashOffset"
            />
          </svg>
          <div class="focus-dial-center">
            <div class="focus-time">{{ displayTime }}</div>
            <div class="focus-sub">{{ mode === 'work' ? '专注中' : '休息中' }}</div>
          </div>
        </div>
        <div v-if="linkedTask" class="focus-task">正在专注：{{ linkedTask.title }}</div>
        <div class="focus-actions">
          <el-button v-if="!running" type="primary" round size="large" @click="start">开始</el-button>
          <el-button v-else round size="large" @click="pause">暂停</el-button>
          <el-button round size="large" @click="exitFocusMode">退出专注（Esc）</el-button>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElNotification } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { useTaskStore } from '@/stores/task'
import { useToolboxStore } from '@/stores/toolbox'

const settingsStore = useSettingsStore()
const taskStore = useTaskStore()
const toolboxStore = useToolboxStore()

/* ---------------- 表盘常量 ---------------- */
const R = 88
const CIRCUMFERENCE = 2 * Math.PI * R

/* ---------------- 状态 ---------------- */
const mode = ref('work') // work | break
const workMinutes = ref(settingsStore.settings.pomodoroWork || 25)
const breakMinutes = ref(settingsStore.settings.pomodoroBreak || 5)
const totalSeconds = ref(workMinutes.value * 60)
const remaining = ref(totalSeconds.value)
const running = ref(false)
const linkedTaskId = ref(null)
const focusMode = ref(false)
const overlayRef = ref(null)

const linkedTask = computed(() => linkedTaskId.value ? taskStore.byId(linkedTaskId.value) : null)

const displayTime = computed(() => {
  const m = Math.floor(remaining.value / 60)
  const s = remaining.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

/** 进度环：剩余越少 offset 越大，形成顺时针消耗效果（配合 rotate(-90deg) 从顶部开始） */
const dashOffset = computed(() => {
  if (totalSeconds.value === 0) return CIRCUMFERENCE
  return CIRCUMFERENCE * (1 - remaining.value / totalSeconds.value)
})

/* ---------------- 计时器 ---------------- */
let timer = null
let endAt = 0

function tick() {
  const left = Math.max(0, Math.round((endAt - Date.now()) / 1000))
  remaining.value = left
  if (left <= 0) complete()
}

function start() {
  if (running.value) return
  running.value = true
  endAt = Date.now() + remaining.value * 1000
  timer = setInterval(tick, 250) // 高频校准，避免标签页切换漂移
}

function pause() {
  running.value = false
  clearInterval(timer)
}

function reset() {
  pause()
  totalSeconds.value = currentDurationMinutes() * 60
  remaining.value = totalSeconds.value
}

function currentDurationMinutes() {
  return mode.value === 'work' ? workMinutes.value : breakMinutes.value
}

/** 时长临时调整（仅页面内生效，不写回全局设置；计时中禁用） */
function onDurationChange() {
  if (running.value) return
  reset()
}

/** 一段结束：工作 → 记录专注并提示休息；休息 → 提示后切回工作。自动进入下一段 */
async function complete() {
  pause()
  if (mode.value === 'work') {
    await toolboxStore.logFocus({ taskId: linkedTaskId.value || null, minutes: workMinutes.value })
    ElNotification({
      title: '专注完成',
      message: `已完成 ${workMinutes.value} 分钟专注，休息 ${breakMinutes.value} 分钟吧`,
      type: 'success',
      duration: 5000
    })
    mode.value = 'break'
  } else {
    ElNotification({
      title: '休息结束',
      message: '可以开始下一段专注了',
      type: 'info',
      duration: 4000
    })
    mode.value = 'work'
  }
  totalSeconds.value = currentDurationMinutes() * 60
  remaining.value = totalSeconds.value
  start() // 自动切换到下一段
}

/* ---------------- 专注模式 ---------------- */
function enterFocusMode() {
  focusMode.value = true
  nextTick(() => overlayRef.value?.focus())
}
function exitFocusMode() {
  focusMode.value = false
}

/** window 捕获监听 Esc：专注模式为模态，优先退出并阻止冒泡到全局 Esc 处理 */
function onWindowKey(e) {
  if (e.key === 'Escape' && focusMode.value) {
    e.stopImmediatePropagation()
    e.preventDefault()
    exitFocusMode()
  }
}
watch(focusMode, (v) => {
  if (v) window.addEventListener('keydown', onWindowKey, true)
  else window.removeEventListener('keydown', onWindowKey, true)
})

/* 全局设置变化时同步默认值（未在计时中时） */
watch(() => [settingsStore.settings.pomodoroWork, settingsStore.settings.pomodoroBreak], ([w, b]) => {
  if (running.value) return
  workMinutes.value = w || 25
  breakMinutes.value = b || 5
  reset()
})

onMounted(() => { if (!toolboxStore.loaded) toolboxStore.load() })
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('keydown', onWindowKey, true)
})
</script>

<style scoped>
.pomodoro { display: flex; flex-direction: column; align-items: center; gap: 16px; }

/* 表盘 */
.dial-wrap { position: relative; width: 200px; height: 200px; }
.dial { width: 100%; height: 100%; transform: rotate(-90deg); }
.dial-bg {
  fill: none;
  stroke: var(--pwb-border);
  stroke-width: 10;
}
.dial-progress {
  fill: none;
  stroke: var(--pwb-primary);
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s linear;
}
.dial-progress.break { stroke: #67c23a; }
.dial-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.dial-time { font-size: 36px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--pwb-text); }
.dial-mode { font-size: 12px; color: var(--pwb-text-secondary); }

/* 控制 */
.controls { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

/* 设置 */
.pomodoro-settings {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
}
.setting-item { display: flex; align-items: center; gap: 8px; }
.setting-item.full { width: 100%; }
.setting-label { font-size: 13px; color: var(--pwb-text-secondary); white-space: nowrap; }
.setting-unit { font-size: 12px; color: var(--pwb-text-secondary); }

/* 统计 */
.focus-stats { display: flex; gap: 16px; width: 100%; }
.stat-item {
  flex: 1;
  text-align: center;
  padding: 8px;
  border-radius: var(--pwb-radius);
  background: var(--pwb-bg-hover);
}
.stat-value { font-size: 20px; font-weight: 700; color: var(--pwb-primary); }
.stat-label { font-size: 12px; color: var(--pwb-text-secondary); margin-top: 4px; }

/* 专注模式遮罩：深色背景，表盘 + 剩余时间 */
.focus-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  outline: none;
}
.focus-mode-label { color: rgba(255, 255, 255, 0.7); font-size: 18px; }
.focus-dial-wrap { position: relative; width: 280px; height: 280px; }
.focus-dial-wrap .dial-bg { stroke: rgba(255, 255, 255, 0.15); }
.focus-dial-wrap .dial-progress { stroke: var(--pwb-primary); }
.focus-dial-wrap .dial-progress.break { stroke: #67c23a; }
.focus-dial-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.focus-time { color: #fff; font-size: 56px; font-weight: 700; font-variant-numeric: tabular-nums; }
.focus-sub { color: rgba(255, 255, 255, 0.6); font-size: 14px; }
.focus-task { color: rgba(255, 255, 255, 0.7); font-size: 14px; }
.focus-actions { display: flex; gap: 16px; }
</style>
