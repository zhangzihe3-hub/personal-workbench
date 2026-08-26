/**
 * 后台监控服务：
 * 1. 任务延期自动检测（每小时 + 启动时）
 * 2. 日程提醒（每 30 秒轮询，桌面通知 + 页面内弹窗）
 * 3. 自动锁定计时
 */
import { useTaskStore } from '@/stores/task'
import { useScheduleStore } from '@/stores/schedule'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { expandSchedules } from '@/stores/schedule'
import { dayjs, fmtDateTime } from '@/utils/datetime'
import { ElNotification } from 'element-plus'
import { isNativeApp, syncNativeNotifications } from '@/services/native'

let timers = []
let cleanupFns = []
let lastActivity = Date.now()

export function startMonitor() {
  stopMonitor()
  lastActivity = Date.now()
  const taskStore = useTaskStore()
  const scheduleStore = useScheduleStore()
  const settingsStore = useSettingsStore()
  const uiStore = useUiStore()

  // 请求桌面通知权限
  if (!isNativeApp() && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }

  // 任务延期检测：启动时 + 每小时
  taskStore.checkDelayed()
  timers.push(setInterval(() => taskStore.checkDelayed(), 60 * 60 * 1000))

  // 日程提醒：每 30 秒检查未来 24 小时内的日程
  const checkReminders = () => {
    const now = dayjs()
    const instances = expandSchedules(scheduleStore.schedules, now.subtract(1, 'hour'), now.add(24, 'hour'))
    for (const inst of instances) {
      const mins = inst.remind_minutes ?? settingsStore.settings.defaultRemind
      if (!mins || mins <= 0) continue
      const remindAt = dayjs(inst.start_time).subtract(mins, 'minute')
      const key = `${inst._master_id || inst.schedule_id}_${inst._instance_date || ''}`
      if (now.isAfter(remindAt) && now.isBefore(dayjs(inst.start_time).add(1, 'minute'))) {
        if (remindedSet.has(key)) continue
        remindedSet.add(key)
        const content = `${fmtDateTime(inst.start_time)}${inst.location ? ' · ' + inst.location : ''}`
        // 桌面通知
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`日程提醒：${inst.title}`, { body: content })
        }
        // 页面内提醒
        ElNotification({ title: `日程提醒：${inst.title}`, message: content, type: 'warning', duration: 10000 })
        uiStore.reminderPopup = { schedule: inst }
      }
    }
  }
  const remindedSet = new Set()
  checkReminders()
  timers.push(setInterval(checkReminders, 30 * 1000))

  // 任务截止提醒：每 30 秒检查，remind_minutes 优先，否则用全局默认
  const taskRemindedSet = new Set()
  const checkTaskReminders = () => {
    const now = dayjs()
    for (const t of taskStore.tasks) {
      if (t.status === 'done' || t.status === 'canceled' || !t.deadline) continue
      const remind = t.remind_minutes ?? settingsStore.settings.defaultTaskRemind
      if (!remind || remind <= 0) continue
      const remindAt = dayjs(t.deadline).subtract(remind, 'minute')
      if (now.isAfter(remindAt) && now.isBefore(dayjs(t.deadline))) {
        const key = `${t.task_id}_${t.deadline}`
        if (taskRemindedSet.has(key)) continue
        taskRemindedSet.add(key)
        const content = `截止 ${fmtDateTime(t.deadline)}`
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`任务提醒：${t.title}`, { body: content })
        }
        ElNotification({ title: `任务提醒：${t.title}`, message: content, type: 'info', duration: 10000 })
      }
    }
  }
  checkTaskReminders()
  timers.push(setInterval(checkTaskReminders, 30 * 1000))

  // Android 后台提醒：交给系统原生通知调度，即使 App 未打开也能触发。
  if (isNativeApp()) {
    const sync = () => syncNativeNotifications(
      taskStore.tasks, scheduleStore.schedules, settingsStore.settings
    ).catch(error => console.error('同步 Android 通知失败', error))
    sync()
    timers.push(setInterval(sync, 5 * 60 * 1000))
    window.addEventListener('pwb:notifications-refresh', sync)
    cleanupFns.push(() => window.removeEventListener('pwb:notifications-refresh', sync))
  }

  // 自动锁定
  const resetActivity = () => { lastActivity = Date.now() }
  ;['click', 'keydown', 'mousemove'].forEach(evt => {
    window.addEventListener(evt, resetActivity, { passive: true })
    cleanupFns.push(() => window.removeEventListener(evt, resetActivity))
  })
  timers.push(setInterval(() => {
    const limit = settingsStore.settings.autoLockMinutes
    if (limit > 0 && settingsStore.settings.passwordHash && !settingsStore.locked) {
      if (Date.now() - lastActivity > limit * 60 * 1000) settingsStore.lock()
    }
  }, 30 * 1000))
}

export function stopMonitor() {
  timers.forEach(clearInterval)
  timers = []
  cleanupFns.forEach(fn => fn())
  cleanupFns = []
}
