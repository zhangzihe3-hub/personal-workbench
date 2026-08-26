/**
 * 统计与复盘计算（纯函数，可单元测试）
 * 口径定义（与 PRD 3.4 一致）：
 *  - 周期内任务 = 创建时间在周期内，或截止时间在周期内，或完成时间在周期内的任务
 *  - 完成率 = 周期内完成任务数 / 周期内总任务数 × 100%
 *  - 延期率 = 周期内延期任务数 / (周期内已完成+延期任务数) × 100%
 *  - 取消率 = 周期内取消任务数 / 周期内总任务数 × 100%
 */
import { dayjs } from './datetime'

function inRange(iso, start, end) {
  if (!iso) return false
  const d = dayjs(iso)
  return !d.isBefore(dayjs(start)) && !d.isAfter(dayjs(end))
}

/** 四象限标签（重要×紧急） */
function quadrantLabel(t) {
  if (t.important && t.urgent) return '重要紧急'
  if (t.important) return '重要不紧急'
  if (t.urgent) return '不重要紧急'
  return '不重要不紧急'
}

/** 判断任务是否属于统计周期 */
export function taskInRange(task, start, end) {
  return inRange(task.created_at, start, end) ||
    inRange(task.deadline, start, end) ||
    inRange(task.completed_at, start, end)
}

export function computeTaskStats(tasks, start, end) {
  const scoped = tasks.filter(t => taskInRange(t, start, end))
  const done = scoped.filter(t => t.status === 'done')
  const delayed = scoped.filter(t => t.status === 'delayed')
  const canceled = scoped.filter(t => t.status === 'canceled')
  const total = scoped.length
  const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10)

  const quadrantDist = { 重要紧急: 0, 重要不紧急: 0, 不重要紧急: 0, 不重要不紧急: 0 }
  const categoryDist = {}
  for (const t of scoped) {
    const ql = quadrantLabel(t)
    quadrantDist[ql] = (quadrantDist[ql] ?? 0) + 1
    const c = t.category || '待分类'
    categoryDist[c] = (categoryDist[c] ?? 0) + 1
  }

  return {
    total,
    done: done.length,
    doing: scoped.filter(t => t.status === 'doing').length,
    todo: scoped.filter(t => t.status === 'todo').length,
    delayed: delayed.length,
    canceled: canceled.length,
    completionRate: pct(done.length, total),
    delayRate: pct(delayed.length, done.length + delayed.length),
    cancelRate: pct(canceled.length, total),
    quadrantDist,
    categoryDist,
    doneList: done,
    delayedList: delayed
  }
}

export function computeScheduleStats(schedules, start, end) {
  const scoped = schedules.filter(s => inRange(s.start_time, start, end))
  let totalMinutes = 0
  const categoryDist = {}
  for (const s of scoped) {
    totalMinutes += dayjs(s.end_time).diff(dayjs(s.start_time), 'minute')
    const c = s.category || '默认'
    categoryDist[c] = (categoryDist[c] ?? 0) + 1
  }
  return {
    total: scoped.length,
    totalMinutes,
    avgMinutes: scoped.length ? Math.round(totalMinutes / scoped.length) : 0,
    categoryDist
  }
}

/** 每日任务完成数趋势（返回 [{date, count}]） */
export function dailyTaskTrend(tasks, start, end) {
  const days = []
  let d = dayjs(start).startOf('day')
  const e = dayjs(end).startOf('day')
  while (!d.isAfter(e)) {
    const key = d.format('YYYY-MM-DD')
    const count = tasks.filter(t => t.completed_at && dayjs(t.completed_at).format('YYYY-MM-DD') === key).length
    days.push({ date: key, count })
    d = d.add(1, 'day')
  }
  return days
}

/** 每日日程时长趋势（分钟） */
export function dailyScheduleTrend(schedules, start, end) {
  const days = []
  let d = dayjs(start).startOf('day')
  const e = dayjs(end).startOf('day')
  while (!d.isAfter(e)) {
    const key = d.format('YYYY-MM-DD')
    let minutes = 0
    for (const s of schedules) {
      if (dayjs(s.start_time).format('YYYY-MM-DD') === key) {
        minutes += dayjs(s.end_time).diff(dayjs(s.start_time), 'minute')
      }
    }
    days.push({ date: key, minutes })
    d = d.add(1, 'day')
  }
  return days
}

/**
 * 生成周期复盘报告
 * @param {'week'|'month'} periodType
 */
export function generateReview(periodType, tasks, schedules, start, end, prevStart, prevEnd) {
  const cur = computeTaskStats(tasks, start, end)
  const prev = computeTaskStats(tasks, prevStart, prevEnd)
  const sch = computeScheduleStats(schedules, start, end)

  const delta = (a, b) => Math.round((a - b) * 10) / 10

  // 亮点：完成率最高的分类 + 完成的高优先级任务
  const catDone = {}
  for (const t of cur.doneList) {
    const c = t.category || '待分类'
    catDone[c] = (catDone[c] ?? 0) + 1
  }
  const bestCategory = Object.entries(catDone).sort((a, b) => b[1] - a[1])[0] || null
  const highPriorityDone = cur.doneList.filter(t => t.important)

  // 问题：延期任务集中的分类 + 关键词
  const catDelayed = {}
  for (const t of cur.delayedList) {
    const c = t.category || '待分类'
    catDelayed[c] = (catDelayed[c] ?? 0) + 1
  }
  const worstCategory = Object.entries(catDelayed).sort((a, b) => b[1] - a[1])[0] || null
  const keywords = extractKeywords(cur.delayedList.map(t => `${t.title} ${t.description || ''}`).join(' '))

  // 行动建议
  const suggestions = []
  if (cur.delayRate > 20) suggestions.push(`本周期延期率 ${cur.delayRate}%，偏高。建议为「${worstCategory ? worstCategory[0] : '相关'}」类任务预留更宽裕的缓冲时间，或拆分为更小的子任务。`)
  if (cur.completionRate < 60 && cur.total > 0) suggestions.push(`任务完成率 ${cur.completionRate}%，建议控制同期并行任务数量，优先聚焦重要任务。`)
  if (sch.total > 0 && sch.avgMinutes > 90) suggestions.push(`平均日程时长 ${sch.avgMinutes} 分钟，偏长。建议将长会议拆分为多个短会，保留专注时间块。`)
  if (suggestions.length === 0) suggestions.push('各项指标表现良好，建议保持当前节奏，并尝试为下周期设定更具挑战性的目标。')

  return {
    periodType,
    range: { start, end },
    overview: {
      completionRate: cur.completionRate,
      completionRateDelta: delta(cur.completionRate, prev.completionRate),
      done: cur.done,
      doneDelta: cur.done - prev.done,
      delayed: cur.delayed,
      delayRate: cur.delayRate,
      scheduleTotal: sch.total,
      scheduleMinutes: sch.totalMinutes
    },
    highlights: { bestCategory, highPriorityDone },
    problems: { worstCategory, delayedCount: cur.delayed, keywords },
    suggestions: suggestions.slice(0, 3)
  }
}

/** 简单中文关键词提取（按 2-4 字滑窗统计高频词） */
export function extractKeywords(text, topN = 5) {
  if (!text) return []
  const stop = new Set(['的', '了', '和', '是', '在', '与', '及', '等', '任务', '完成', '需要', '进行', '因为', '所以', '没有', '时间'])
  const freq = {}
  const clean = text.replace(/[A-Za-z0-9\s#*>\-_.，。！？、：；""''（）()]/g, '')
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i + len <= clean.length; i++) {
      const w = clean.slice(i, i + len)
      if ([...w].some(ch => stop.has(ch))) continue
      // 长词加权，优先保留语义更完整的长词
      freq[w] = (freq[w] ?? 0) + (len - 1)
    }
  }
  return Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w]) => w)
}
