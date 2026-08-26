import { describe, it, expect } from 'vitest'
import { computeTaskStats, computeScheduleStats, extractKeywords, generateReview } from '../src/utils/stats.js'

const START = '2026-08-01T00:00:00'
const END = '2026-08-31T23:59:59'

const mkTask = (over) => ({
  task_id: Math.random().toString(36).slice(2),
  title: 't', important: false, urgent: false, status: 'todo', category: '工作', tags: [],
  created_at: '2026-08-05T10:00:00', deadline: null, completed_at: null, ...over
})

describe('任务统计', () => {
  it('完成率/延期率/取消率计算正确', () => {
    const tasks = [
      mkTask({ status: 'done', completed_at: '2026-08-06T10:00:00' }),
      mkTask({ status: 'done', completed_at: '2026-08-07T10:00:00' }),
      mkTask({ status: 'delayed' }),
      mkTask({ status: 'canceled' }),
      mkTask({ status: 'todo' }),
      mkTask({ status: 'done', completed_at: '2026-07-20T10:00:00', created_at: '2026-07-15T10:00:00' }) // 周期外
    ]
    const r = computeTaskStats(tasks, START, END)
    expect(r.total).toBe(5)
    expect(r.done).toBe(2)
    expect(r.completionRate).toBe(40)
    // 延期率 = 1 / (2+1) = 33.3%
    expect(r.delayRate).toBe(33.3)
    expect(r.cancelRate).toBe(20)
  })

  it('四象限与分类分布', () => {
    const tasks = [
      mkTask({ important: true, urgent: true }),
      mkTask({ important: true, urgent: true }),
      mkTask({ category: '学习' })
    ]
    const r = computeTaskStats(tasks, START, END)
    expect(r.quadrantDist['重要紧急']).toBe(2)
    expect(r.categoryDist['学习']).toBe(1)
  })

  it('空数据不报错', () => {
    const r = computeTaskStats([], START, END)
    expect(r.completionRate).toBe(0)
    expect(r.delayRate).toBe(0)
  })
})

describe('日程统计', () => {
  it('总时长与平均时长', () => {
    const schedules = [
      { start_time: '2026-08-05T10:00:00', end_time: '2026-08-05T11:30:00', category: '会议' },
      { start_time: '2026-08-06T14:00:00', end_time: '2026-08-06T14:30:00', category: '个人' },
      { start_time: '2026-07-01T10:00:00', end_time: '2026-07-01T11:00:00', category: '会议' } // 周期外
    ]
    const r = computeScheduleStats(schedules, START, END)
    expect(r.total).toBe(2)
    expect(r.totalMinutes).toBe(120)
    expect(r.avgMinutes).toBe(60)
    expect(r.categoryDist['会议']).toBe(1)
  })
})

describe('复盘报告', () => {
  it('生成4个固定模块', () => {
    const tasks = [
      mkTask({ status: 'done', completed_at: '2026-08-06T10:00:00', important: true, urgent: true, title: '重要事项' }),
      mkTask({ status: 'delayed', title: '接口联调延期', description: '接口联调依赖等待' }),
      mkTask({ status: 'delayed', title: '接口文档延期', description: '接口联调依赖等待' })
    ]
    const prev = ['2026-07-01T00:00:00', '2026-07-31T23:59:59']
    const review = generateReview('month', tasks, [], START, END, prev[0], prev[1])
    expect(review.overview).toBeDefined()
    expect(review.highlights.highPriorityDone).toHaveLength(1)
    expect(review.problems.delayedCount).toBe(2)
    expect(review.suggestions.length).toBeGreaterThan(0)
    expect(review.suggestions.length).toBeLessThanOrEqual(3)
  })
})

describe('关键词提取', () => {
  it('提取高频词', () => {
    const kw = extractKeywords('联调延期 联调延期 联调延期 文档编写 文档编写')
    expect(kw[0]).toBe('联调延期')
  })
})
