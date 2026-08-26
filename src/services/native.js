import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { dayjs } from '@/utils/datetime'
import { expandSchedules } from '@/stores/schedule'
import { expandTasks } from '@/stores/task'

export const isNativeApp = () => Capacitor.isNativePlatform()
let lastNotificationSignature = ''

export async function listenForNativeNotificationActions(callback) {
  if (!isNativeApp()) return null
  return LocalNotifications.addListener('localNotificationActionPerformed', action => {
    const extra = action.notification?.extra
    if (extra?.type && extra?.id) callback(extra)
  })
}

function notificationId(key) {
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619)
  return Math.abs(hash % 2147483646) + 1
}

export async function syncNativeNotifications(tasks, schedules, settings) {
  if (!isNativeApp()) return
  const signature = JSON.stringify({
    tasks: tasks.map(({ task_id, title, deadline, status, remind_minutes, repeat_type, repeat_end, completed_dates, canceled_dates, updated_at }) =>
      ({ task_id, title, deadline, status, remind_minutes, repeat_type, repeat_end, completed_dates, canceled_dates, updated_at })),
    schedules: schedules.map(({ schedule_id, title, start_time, end_time, remind_minutes, repeat_type, repeat_end, updated_at }) =>
      ({ schedule_id, title, start_time, end_time, remind_minutes, repeat_type, repeat_end, updated_at })),
    defaultRemind: settings.defaultRemind,
    defaultTaskRemind: settings.defaultTaskRemind
  })
  if (signature === lastNotificationSignature) return
  const permission = await LocalNotifications.checkPermissions()
  const status = permission.display === 'granted'
    ? permission
    : await LocalNotifications.requestPermissions()
  if (status.display !== 'granted') return

  await LocalNotifications.createChannel({
    id: 'task-deadlines',
    name: '任务截止提醒',
    description: '在任务截止前 30 分钟提醒',
    importance: 5,
    visibility: 1,
    vibration: true
  })

  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) })
  }

  const now = dayjs()
  const end = now.add(60, 'day')
  const notifications = []
  const scheduleInstances = expandSchedules(schedules, now, end)
  for (const item of scheduleInstances) {
    const minutes = item.remind_minutes ?? settings.defaultRemind
    if (!minutes || minutes <= 0) continue
    const at = dayjs(item.start_time).subtract(minutes, 'minute')
    if (!at.isAfter(now)) continue
    const key = `schedule:${item._master_id || item.schedule_id}:${item._instance_date || item.start_time}`
    notifications.push({
      id: notificationId(key), title: `日程提醒：${item.title}`,
      body: `${dayjs(item.start_time).format('MM-DD HH:mm')}${item.location ? ` · ${item.location}` : ''}`,
      schedule: { at: at.toDate(), allowWhileIdle: true },
      extra: { type: 'schedule', id: item._master_id || item.schedule_id }
    })
  }

  const taskInstances = expandTasks(tasks, now, end)
  for (const item of taskInstances) {
    if (!item.deadline || ['done', 'canceled'].includes(item.status)) continue
    if (dayjs(item.deadline).isAfter(end)) continue
    const minutes = item.remind_minutes ?? settings.defaultTaskRemind
    if (!minutes || minutes <= 0) continue
    const at = dayjs(item.deadline).subtract(minutes, 'minute')
    if (!at.isAfter(now)) continue
    const key = `task:${item._master_id || item.task_id}:${item._instance_date || item.deadline}`
    notifications.push({
      id: notificationId(key), title: `任务提醒：${item.title}`,
      body: `截止 ${dayjs(item.deadline).format('MM-DD HH:mm')}`,
      channelId: 'task-deadlines',
      schedule: { at: at.toDate(), allowWhileIdle: true },
      extra: { type: 'task', id: item._master_id || item.task_id }
    })
  }

  notifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime())
  if (notifications.length) await LocalNotifications.schedule({ notifications: notifications.slice(0, 200) })
  lastNotificationSignature = signature
}
