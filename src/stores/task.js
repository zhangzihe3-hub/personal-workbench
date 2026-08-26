/**
 * 任务模块状态（PRD 3.1）
 * 状态流转：todo ↔ doing → done / canceled；超时自动 delayed
 * 四象限：重要(important) × 紧急(urgent) 替代 P0-P3 优先级
 * 重复任务：repeat_type + 视图展开（expandTasks），实例完成/跳过记入日期数组
 */
import { defineStore } from 'pinia'
import { db } from '@/db'
import { uuid } from '@/utils/id'
import { nowISO, dayjs } from '@/utils/datetime'

/* ---------------- 四象限 ---------------- */
export const QUADRANTS = [
  { key: 'iu', label: '重要紧急', important: true, urgent: true, color: '#f56c6c', hint: '立即处理' },
  { key: 'in', label: '重要不紧急', important: true, urgent: false, color: '#e6a23c', hint: '计划安排' },
  { key: 'nu', label: '不重要紧急', important: false, urgent: true, color: '#3b6fe0', hint: '尽快处理' },
  { key: 'nn', label: '不重要不紧急', important: false, urgent: false, color: '#909399', hint: '有空再做' }
]

export function getQuadrant(task) {
  if (task.important && task.urgent) return QUADRANTS[0]
  if (task.important) return QUADRANTS[1]
  if (task.urgent) return QUADRANTS[2]
  return QUADRANTS[3]
}

/** 象限排序权重：重要紧急=0 … 不重要不紧急=3 */
export function quadrantRank(task) {
  if (task.important && task.urgent) return 0
  if (task.important) return 1
  if (task.urgent) return 2
  return 3
}

/** 默认排序：置顶优先 → 象限 → 截止时间升序 → 创建时间降序 */
export function defaultTaskSort(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
  const ra = quadrantRank(a)
  const rb = quadrantRank(b)
  if (ra !== rb) return ra - rb
  if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1
  if (a.deadline && !b.deadline) return -1
  if (!a.deadline && b.deadline) return 1
  return a.created_at > b.created_at ? -1 : 1
}

export function createTask(data = {}) {
  const now = nowISO()
  return {
    task_id: data.task_id || uuid(),
    title: (data.title || '').slice(0, 200),
    description: data.description || '',
    important: data.important ?? false,
    urgent: data.urgent ?? false,
    status: ['todo', 'doing', 'done', 'canceled', 'delayed'].includes(data.status) ? data.status : 'todo',
    start_time: data.start_time || null,
    deadline: data.deadline || null,
    category: (data.category || '待分类').slice(0, 50),
    tags: Array.isArray(data.tags) ? data.tags : [],
    subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
    related_schedule_ids: Array.isArray(data.related_schedule_ids) ? data.related_schedule_ids : [],
    related_note_ids: Array.isArray(data.related_note_ids) ? data.related_note_ids : [],
    repeat_type: ['none', 'daily', 'weekly', 'monthly', 'yearly', 'exception'].includes(data.repeat_type) ? data.repeat_type : 'none',
    repeat_end: data.repeat_end || null,
    canceled_dates: Array.isArray(data.canceled_dates) ? data.canceled_dates : [],
    completed_dates: Array.isArray(data.completed_dates) ? data.completed_dates : [],
    exception_of: data.exception_of || null,
    exception_date: data.exception_date || null,
    remind_minutes: data.remind_minutes ?? null,
    pinned: data.pinned ?? false,
    sort_order: data.sort_order ?? Date.now(),
    created_at: data.created_at || now,
    updated_at: now,
    completed_at: data.completed_at || null
  }
}

/** 兼容旧版本及外部同步中缺少集合字段的任务记录。 */
function normalizeTask(task) {
  return {
    ...task,
    tags: Array.isArray(task.tags) ? task.tags : [],
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    related_schedule_ids: Array.isArray(task.related_schedule_ids) ? task.related_schedule_ids : [],
    related_note_ids: Array.isArray(task.related_note_ids) ? task.related_note_ids : [],
    canceled_dates: Array.isArray(task.canceled_dates) ? task.canceled_dates : [],
    completed_dates: Array.isArray(task.completed_dates) ? task.completed_dates : []
  }
}

/**
 * 将重复任务展开为指定区间内的实例列表（类似日程 expandSchedules）
 * - 非重复任务：deadline 落在区间内则原样返回
 * - 重复任务：以首次 deadline 为锚点按周期后移，跳过 canceled_dates / completed_dates / 例外日期
 * - 例外记录（repeat_type='exception'）单独返回
 * 实例带 _instance_date（YYYY-MM-DD）与 _master_id（主任务ID）
 */
export function expandTasks(tasks, rangeStart, rangeEnd) {
  const out = []
  const rs = dayjs(rangeStart)
  const re = dayjs(rangeEnd)
  for (const t of tasks) {
    // 例外实例、非重复任务、无截止任务：原样保留（不受区间过滤，时间过滤由视图层另做）
    if (t.repeat_type === 'exception' || t.repeat_type === 'none' || !t.deadline) {
      out.push(t)
      continue
    }
    const unitMap = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }
    const unit = unitMap[t.repeat_type]
    if (!unit) { out.push(t); continue }
    const dur = t.start_time ? dayjs(t.deadline).diff(dayjs(t.start_time)) : 0
    const repeatEnd = t.repeat_end ? dayjs(t.repeat_end).endOf('day') : re
    let inst = dayjs(t.deadline)
    let guard = 0
    let produced = 0
    while (inst.isBefore(re) && guard < 800) {
      guard++
      if (inst.isAfter(repeatEnd)) break
      const dateKeyStr = inst.format('YYYY-MM-DD')
      const hasException = tasks.some(x => x.exception_of === t.task_id && x.exception_date === dateKeyStr)
      const skipped = (t.canceled_dates || []).includes(dateKeyStr) || (t.completed_dates || []).includes(dateKeyStr)
      if (!hasException && !skipped && inst.isAfter(rs)) {
        out.push({
          ...t,
          deadline: inst.toISOString(),
          start_time: t.start_time ? inst.subtract(dur, 'millisecond').toISOString() : null,
          _instance_date: dateKeyStr,
          _master_id: t.task_id
        })
        produced++
      }
      inst = inst.add(1, unit)
    }
    // 区间内无任何实例时，保留主记录兜底展示
    if (produced === 0) out.push(t)
  }
  return out
}

export const useTaskStore = defineStore('task', {
  state: () => ({ tasks: [], views: [], loaded: false }),
  getters: {
    byId: (s) => (id) => s.tasks.find(t => t.task_id === id),
    activeTasks: (s) => s.tasks.filter(t => t.status !== 'done' && t.status !== 'canceled'),
    delayedTasks: (s) => s.tasks.filter(t => t.status === 'delayed'),
    /** 今日任务：deadline 或 start_time 落在今天，且未取消 */
    todayTasks(s) {
      const today = dayjs().format('YYYY-MM-DD')
      return s.tasks.filter(t => {
        if (t.status === 'canceled') return false
        const d = t.deadline ? dayjs(t.deadline).format('YYYY-MM-DD') : null
        const st = t.start_time ? dayjs(t.start_time).format('YYYY-MM-DD') : null
        return d === today || st === today
      })
    },
    /** 已过期未完成（含今天之前） */
    overdueTasks(s) {
      const now = nowISO()
      return s.tasks.filter(t => t.deadline && t.deadline < now && t.status !== 'done' && t.status !== 'canceled')
    },
    todayDone(s) {
      const today = dayjs().format('YYYY-MM-DD')
      return s.tasks.filter(t => t.completed_at && dayjs(t.completed_at).format('YYYY-MM-DD') === today)
    }
  },
  actions: {
    async load() {
      this.tasks = (await db.tasks.toArray()).map(normalizeTask)
      this.views = await db.saved_views.toArray()
      this.loaded = true
    },
    async addTask(data) {
      const task = createTask(data)
      await db.tasks.put(task)
      this.tasks.push(task)
      return task
    },
    async updateTask(id, patch) {
      const task = this.byId(id)
      if (!task) return null
      const before = { ...task }
      Object.assign(task, patch, { updated_at: nowISO() })
      await db.tasks.put(JSON.parse(JSON.stringify(task)))
      return { task, before }
    },
    /** 状态切换：处理 completed_at 与子任务联动 */
    async setStatus(id, status) {
      const task = this.byId(id)
      if (!task) return null
      const before = JSON.parse(JSON.stringify(task))
      task.status = status
      if (status === 'done') {
        task.completed_at = nowISO()
        task.subtasks = task.subtasks.map(st => ({ ...st, status: 'done' }))
      } else {
        task.completed_at = null
      }
      task.updated_at = nowISO()
      await db.tasks.put(JSON.parse(JSON.stringify(task)))
      return { task, before }
    },
    async deleteTask(id) {
      await db.tasks.delete(id)
      this.tasks = this.tasks.filter(t => t.task_id !== id)
    },
    async restoreTask(task) {
      await db.tasks.put(JSON.parse(JSON.stringify(task)))
      if (!this.byId(task.task_id)) this.tasks.push(task)
    },
    /** 标记重复任务的某次实例：complete=完成 / skip=跳过（记入日期数组，展开时跳过） */
    async markInstance(id, instanceDate, mark = 'complete') {
      const task = this.byId(id)
      if (!task || !instanceDate) return null
      const before = JSON.parse(JSON.stringify(task))
      const field = mark === 'complete' ? 'completed_dates' : 'canceled_dates'
      if (!task[field]) task[field] = []
      if (!task[field].includes(instanceDate)) task[field].push(instanceDate)
      task.updated_at = nowISO()
      await db.tasks.put(JSON.parse(JSON.stringify(task)))
      return { task, before }
    },
    /** 置顶切换 */
    async togglePin(id) {
      const task = this.byId(id)
      if (!task) return null
      task.pinned = !task.pinned
      task.updated_at = nowISO()
      await db.tasks.put(JSON.parse(JSON.stringify(task)))
      return task
    },
    /** 子任务 */
    async toggleSubtask(taskId, subtaskId) {
      const task = this.byId(taskId)
      if (!task) return null
      const st = task.subtasks.find(x => x.subtask_id === subtaskId)
      if (!st) return null
      st.status = st.status === 'done' ? 'todo' : 'done'
      task.updated_at = nowISO()
      await db.tasks.put(JSON.parse(JSON.stringify(task)))
      const allDone = task.subtasks.length > 0 && task.subtasks.every(x => x.status === 'done')
      return { task, allDone }
    },
    /** 批量操作 */
    async batchUpdate(ids, patch) {
      const snapshots = []
      for (const id of ids) {
        const task = this.byId(id)
        if (!task) continue
        snapshots.push(JSON.parse(JSON.stringify(task)))
        if (patch.status) {
          task.status = patch.status
          task.completed_at = patch.status === 'done' ? nowISO() : null
          if (patch.status === 'done') task.subtasks = task.subtasks.map(st => ({ ...st, status: 'done' }))
        }
        if (patch.category) task.category = patch.category
        if (patch.important !== undefined) task.important = patch.important
        if (patch.urgent !== undefined) task.urgent = patch.urgent
        if (patch.addTags) task.tags = [...new Set([...task.tags, ...patch.addTags])]
        task.updated_at = nowISO()
        await db.tasks.put(JSON.parse(JSON.stringify(task)))
      }
      return snapshots
    },
    async batchDelete(ids) {
      const snapshots = this.tasks.filter(t => ids.includes(t.task_id)).map(t => JSON.parse(JSON.stringify(t)))
      await db.tasks.bulkDelete(ids)
      this.tasks = this.tasks.filter(t => !ids.includes(t.task_id))
      return snapshots
    },
    /** 延期自动检测：当前时间 > deadline 且状态非 done/canceled → delayed */
    async checkDelayed() {
      const now = nowISO()
      const toDelay = this.tasks.filter(t =>
        t.deadline && t.deadline < now && t.status !== 'done' && t.status !== 'canceled' && t.status !== 'delayed'
      )
      for (const t of toDelay) {
        t.status = 'delayed'
        t.updated_at = now
        await db.tasks.put(JSON.parse(JSON.stringify(t)))
      }
      return toDelay.length
    },
    /** 延期任务恢复为进行中/待开始（修改截止时间后调用） */
    async undelayIfNeeded(id) {
      const task = this.byId(id)
      if (task && task.status === 'delayed' && task.deadline && task.deadline > nowISO()) {
        await this.setStatus(id, 'todo')
      }
    },
    /* ---------------- 智能清单（保存的筛选） ---------------- */
    async addView({ name, filters }) {
      const view = { view_id: uuid(), name: (name || '').slice(0, 50), filters: filters || {}, created_at: nowISO() }
      await db.saved_views.put(view)
      this.views.push(view)
      return view
    },
    async updateView(id, patch) {
      const v = this.views.find(x => x.view_id === id)
      if (!v) return null
      Object.assign(v, patch)
      await db.saved_views.put(JSON.parse(JSON.stringify(v)))
      return v
    },
    async deleteView(id) {
      await db.saved_views.delete(id)
      this.views = this.views.filter(v => v.view_id !== id)
    }
  }
})
