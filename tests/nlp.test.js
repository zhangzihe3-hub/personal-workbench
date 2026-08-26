import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import { parseTaskInput, parseScheduleInput, extractDateTime, quickNoteTitle } from '../src/utils/nlp.js'

// 固定基准时间：2026-08-04（周二）10:00
const BASE = dayjs('2026-08-04T10:00:00')

describe('任务自然语言解析', () => {
  it('解析「明天18点前 重要紧急 完成需求文档 #工作」', () => {
    const r = parseTaskInput('明天18点前 重要紧急 完成需求文档 #工作', BASE)
    expect(r.title).toBe('完成需求文档')
    expect(r.important).toBe(true)
    expect(r.urgent).toBe(true)
    expect(r.tags).toEqual(['工作'])
    expect(dayjs(r.deadline).format('YYYY-MM-DD HH:mm')).toBe('2026-08-05 18:00')
  })

  it('解析「后天下午3点 交周报」', () => {
    const r = parseTaskInput('后天下午3点 交周报', BASE)
    expect(r.title).toBe('交周报')
    expect(dayjs(r.deadline).format('YYYY-MM-DD HH:mm')).toBe('2026-08-06 15:00')
  })

  it('无时间信息时默认当天18点/无截止', () => {
    const r = parseTaskInput('整理桌面', BASE)
    expect(r.title).toBe('整理桌面')
    expect(r.deadline).toBeNull()
    expect(r.important).toBe(false)
    expect(r.urgent).toBe(false)
  })

  it('解析重复周期「每周 交周报」', () => {
    const r = parseTaskInput('每周 交周报', BASE)
    expect(r.title).toBe('交周报')
    expect(r.repeat_type).toBe('weekly')
  })

  it('只有日期无时刻的任务截止默认18:00', () => {
    const r = parseTaskInput('周五 交方案', BASE)
    expect(dayjs(r.deadline).format('YYYY-MM-DD HH:mm')).toBe('2026-08-07 18:00')
  })

  it('解析 8月10日上午9点半', () => {
    const r = parseTaskInput('8月10日上午9点半 体检', BASE)
    expect(r.title).toBe('体检')
    expect(dayjs(r.deadline).format('YYYY-MM-DD HH:mm')).toBe('2026-08-10 09:30')
  })

  it('解析 N天后与N小时后', () => {
    expect(dayjs(parseTaskInput('3天后 还书', BASE).deadline).format('YYYY-MM-DD')).toBe('2026-08-07')
    const r = parseTaskInput('2小时后 喝水提醒', BASE)
    expect(dayjs(r.deadline).format('HH:mm')).toBe('12:00')
  })

  it('多个标签', () => {
    const r = parseTaskInput('#工作 #紧急 修复线上bug', BASE)
    expect(r.tags).toEqual(['工作', '紧急'])
    expect(r.title).toBe('修复线上bug')
  })
})

describe('日程自然语言解析', () => {
  it('解析「下周三下午2点到4点 项目评审会 会议室A」', () => {
    const r = parseScheduleInput('下周三下午2点到4点 项目评审会 会议室A', BASE)
    expect(r.title).toBe('项目评审会')
    expect(r.location).toBe('会议室A')
    // 2026-08-04 是周二，下周三 = 2026-08-12
    expect(dayjs(r.start_time).format('YYYY-MM-DD HH:mm')).toBe('2026-08-12 14:00')
    expect(dayjs(r.end_time).format('YYYY-MM-DD HH:mm')).toBe('2026-08-12 16:00')
  })

  it('解析「明天 14:00-16:00 团队周会」', () => {
    const r = parseScheduleInput('明天14:00-16:00 团队周会', BASE)
    expect(dayjs(r.start_time).format('YYYY-MM-DD HH:mm')).toBe('2026-08-05 14:00')
    expect(dayjs(r.end_time).format('YYYY-MM-DD HH:mm')).toBe('2026-08-05 16:00')
  })

  it('无结束时间默认1小时', () => {
    const r = parseScheduleInput('今晚7点 健身', BASE)
    expect(dayjs(r.end_time).diff(dayjs(r.start_time), 'hour')).toBe(1)
  })

  it('无日期有时刻，已过时刻顺延明天', () => {
    const r = parseScheduleInput('8点 晨会', BASE) // 基准10点，8点已过
    expect(dayjs(r.start_time).format('YYYY-MM-DD')).toBe('2026-08-05')
  })
})

describe('速记标题', () => {
  it('取正文前15字', () => {
    expect(quickNoteTitle('这是一条超过十五个字的速记内容用于测试截断')).toBe('这是一条超过十五个字的速记内容')
  })
  it('空内容返回未命名', () => {
    expect(quickNoteTitle('   ')).toBe('未命名笔记')
  })
})
