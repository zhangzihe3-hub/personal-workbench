/**
 * 中文自然语言快速录入解析器（纯函数，可单元测试）
 * 支持从一句话中提取：时间、优先级、标签、地点，剩余部分作为标题。
 *
 * 任务示例：「明天18点前 重要紧急 完成需求文档 #工作」
 *   → { title: '完成需求文档', deadline: 明天18:00, important: true, urgent: true, tags: ['工作'] }
 * 日程示例：「下周三下午2点到4点 项目评审会 会议室A」
 *   → { title: '项目评审会 会议室A' → 提取地点, start_time, end_time }
 */
import dayjs from 'dayjs'

const CN_NUM = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

function cnToNum(str) {
  if (str == null) return null
  if (/^\d+$/.test(str)) return parseInt(str, 10)
  if (str === '十') return 10
  const m = str.match(/^十([一二三四五六七八九])$/)
  if (m) return 10 + CN_NUM[m[1]]
  const m2 = str.match(/^([一二三四五六七八九])十([一二三四五六七八九])?$/)
  if (m2) return CN_NUM[m2[1]] * 10 + (m2[2] ? CN_NUM[m2[2]] : 0)
  return CN_NUM[str] ?? null
}

const WEEKDAY_MAP = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }

/**
 * 从文本中提取日期时间，返回 { date: dayjs|null, matched: 匹配到的原文片段数组 }
 * @param {string} text
 * @param {dayjs.Dayjs} base 基准时间（便于测试）
 */
export function extractDateTime(text, base = dayjs()) {
  const matched = []
  let rest = text
  let date = null // dayjs
  let hour = null
  let minute = 0
  let hasExplicitTime = false
  let isDeadlineStyle = false // “X点前” 视为截止时间

  // 1. 绝对日期：2026-08-05 / 2026/8/5 / 8月5日（号）
  let m = rest.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日号]?/)
  if (m) {
    date = dayjs(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')} 00:00`)
    matched.push(m[0])
    rest = rest.replace(m[0], ' ')
  } else {
    m = rest.match(/(\d{1,2})月(\d{1,2})[日号]/)
    if (m) {
      let d = dayjs(`${base.year()}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')} 00:00`)
      if (d.isBefore(base.startOf('day'))) d = d.add(1, 'year')
      date = d
      matched.push(m[0])
      rest = rest.replace(m[0], ' ')
    }
  }

  // 2. 相对日期：今天/明天/后天/大后天/昨天
  if (!date) {
    const relMap = { 今天: 0, 明天: 1, 后天: 2, 大后天: 3, 昨天: -1 }
    for (const [kw, offset] of Object.entries(relMap)) {
      if (rest.includes(kw)) {
        date = base.startOf('day').add(offset, 'day')
        matched.push(kw)
        rest = rest.replace(kw, ' ')
        break
      }
    }
  }

  // 3. 星期：下周三/周三/礼拜五/周日（默认取未来最近一个）
  if (!date) {
    m = rest.match(/(下下|下|这|本)?(周|星期|礼拜)([一二三四五六日天\d])/)
    if (m) {
      const weekOffset = m[1] === '下下' ? 2 : m[1] === '下' ? 1 : 0
      const target = WEEKDAY_MAP[m[3]] ?? (parseInt(m[3], 10) % 7)
      let d = base.startOf('day')
      let delta = (target - d.day() + 7) % 7
      if (weekOffset === 0 && delta === 0) delta = 0 // 本周当天
      d = d.add(delta + weekOffset * 7, 'day')
      date = d
      matched.push(m[0])
      rest = rest.replace(m[0], ' ')
    }
  }

  // 4. N天后/N小时后/N分钟后
  if (!date) {
    m = rest.match(/(\d+|[一二两三四五六七八九十]+)(个)?(天|日)后/)
    if (m) {
      const n = cnToNum(m[1])
      if (n != null) {
        date = base.startOf('day').add(n, 'day')
        matched.push(m[0])
        rest = rest.replace(m[0], ' ')
      }
    }
  }
  m = rest.match(/(\d+|[一二两三四五六七八九十]+)(个)?小时后/)
  if (m) {
    const n = cnToNum(m[1])
    if (n != null) {
      date = base.add(n, 'hour')
      hour = date.hour()
      minute = date.minute()
      hasExplicitTime = true
      matched.push(m[0])
      rest = rest.replace(m[0], ' ')
    }
  }
  if (!date) {
    m = rest.match(/(半|(\d+))分钟后/)
    if (m) {
      const n = m[1] === '半' ? 30 : parseInt(m[2], 10)
      date = base.add(n, 'minute')
      hour = date.hour()
      minute = date.minute()
      hasExplicitTime = true
      matched.push(m[0])
      rest = rest.replace(m[0], ' ')
    }
  }

  // 5. 时刻：下午2点 / 18:30 / 18点30分 / 晚上八点半 / 9点
  let period = null
  m = rest.match(/(早上|上午|中午|下午|傍晚|晚上|凌晨)/)
  if (m) {
    period = m[1]
    matched.push(m[0])
    rest = rest.replace(m[0], ' ')
  }
  m = rest.match(/(\d{1,2})[:：](\d{1,2})(分)?(前)?/)
  if (m) {
    hour = parseInt(m[1], 10)
    minute = parseInt(m[2], 10)
    hasExplicitTime = true
    if (m[4]) isDeadlineStyle = true
    matched.push(m[0])
    rest = rest.replace(m[0], ' ')
  } else {
    m = rest.match(/(\d{1,2}|[一二两三四五六七八九十]+)点(半|(\d{1,2}|[一二三四五六七八九十]+)分)?(前)?/)
    if (m) {
      let h = cnToNum(m[1])
      if (h != null) {
        hour = h
        if (m[2] === '半') minute = 30
        else if (m[2]) minute = cnToNum(m[3]) ?? 0
        hasExplicitTime = true
        if (m[4]) isDeadlineStyle = true
        matched.push(m[0])
        rest = rest.replace(m[0], ' ')
      }
    }
  }

  // 根据时段词修正小时
  if (hasExplicitTime && hour != null && period) {
    if ((period === '下午' || period === '傍晚' || period === '晚上') && hour < 12) hour += 12
    if (period === '中午' && hour < 11) hour += 12
    if (period === '凌晨' && hour === 12) hour = 0
  }

  // 有日期但没时刻时，默认时间
  if (date && !hasExplicitTime) {
    hour = null // 由调用方决定默认时刻（任务截止=18:00，日程=整点）
  }

  // 只有时刻没有日期：若该时刻已过则顺延到明天（仅对“安排未来事项”合理）
  if (!date && hasExplicitTime) {
    date = base.startOf('day')
    if (hour != null && base.hour() * 60 + base.minute() >= hour * 60 + minute) {
      date = date.add(1, 'day')
    }
  }

  if (!date) return { date: null, matched, rest: rest.replace(/\s+/g, ' ').trim(), hasExplicitTime, isDeadlineStyle }
  if (hour != null) date = date.hour(hour).minute(minute).second(0)
  return { date, matched, rest: rest.replace(/\s+/g, ' ').trim(), hasExplicitTime, isDeadlineStyle }
}

/**
 * 解析任务快速录入
 * 支持：四象限关键词（重要/紧急）、重复周期（每天/每周/每月/每年）、时间、标签
 * @returns {{title:string, deadline:string|null, important:boolean, urgent:boolean, repeat_type:string, tags:string[], description:string}}
 */
export function parseTaskInput(text, base = dayjs()) {
  let rest = ` ${text} `
  const tags = []
  // #标签（支持中文，遇空格结束）
  rest = rest.replace(/#([^\s#]+)/g, (_, t) => { tags.push(t); return ' ' })

  // 四象限：重要 / 紧急
  let important = false
  let urgent = false
  rest = rest.replace(/重要/g, () => { important = true; return ' ' })
  rest = rest.replace(/紧急|加急/g, () => { urgent = true; return ' ' })

  // 重复周期（第一版支持简单周期词；具体星期锚定可在详情面板设置）
  let repeatType = 'none'
  rest = rest.replace(/每天|每日/, () => { repeatType = 'daily'; return ' ' })
  rest = rest.replace(/每周(?!一二三四五六日天\d)/, () => { repeatType = 'weekly'; return ' ' })
  rest = rest.replace(/每月/, () => { repeatType = 'monthly'; return ' ' })
  rest = rest.replace(/每年|年度/, () => { repeatType = 'yearly'; return ' ' })

  const { date, rest: remain, hasExplicitTime } = extractDateTime(rest.trim(), base)
  let deadline = null
  if (date) {
    deadline = (hasExplicitTime ? date : date.hour(18).minute(0).second(0)).toISOString()
  }
  const title = remain.replace(/[，。,\s]+$/, '').trim()
  return { title, deadline, important, urgent, repeat_type: repeatType, tags, description: '' }
}

/**
 * 解析日程快速录入
 * 支持「A点到B点」时间段、「到/至/-」连接的两个时刻，末尾地点词（xx室/xx楼/xx中心/xx馆等）识别为地点
 * @returns {{title:string, start_time:string|null, end_time:string|null, location:string}}
 */
export function parseScheduleInput(text, base = dayjs()) {
  let rest = ` ${text} `
  rest = rest.replace(/#([^\s#]+)/g, ' ')

  // 时间段：下午2点到4点 / 14:00-16:00 / 14:00至16:00
  const { date, rest: r1, hasExplicitTime } = extractDateTime(rest.trim(), base)
  let start = date ? (hasExplicitTime ? date : date.hour(9).minute(0).second(0)) : null
  let end = null

  // 在剩余文本中查找第二个时刻作为结束时间（先剥离「到/至/-」连接符）
  if (start) {
    const r1clean = r1.replace(/^[\s到至\-~～]+/, '')
    const second = extractDateTime(r1clean, base)
    if (second.date && second.hasExplicitTime) {
      end = second.date
      // 结束时间沿用开始日期
      end = start.hour(end.hour()).minute(end.minute()).second(0)
      // 「下午2点到4点」语境下，结束的小时数若 <12 且不晚于开始时间，按下午处理 +12h
      if (!end.isAfter(start) && end.hour() < 12) end = end.add(12, 'hour')
      if (!end.isAfter(start)) end = end.add(1, 'hour')
      rest = ` ${second.rest} `
    } else {
      // 检查 “到4点” 这种半截表达（extractDateTime 已吃掉“到”前的内容）
      const m2 = r1.match(/(\d{1,2})[:：](\d{1,2})/) || r1.match(/(\d{1,2})点(半)?/)
      if (m2) {
        const eh = parseInt(m2[1], 10)
        const em = m2[2] === '半' ? 30 : (m2[2] ? parseInt(m2[2], 10) : 0)
        end = start.hour(eh < start.hour() ? eh + 12 : eh).minute(em).second(0)
        rest = ` ${r1.replace(m2[0], ' ')} `
      } else {
        rest = ` ${r1} `
      }
    }
  } else {
    rest = ` ${r1} `
  }
  if (start && !end) end = start.add(1, 'hour')

  // 地点识别：结尾的「xx室/xx楼/xx厅/xx馆/xx中心/xx大厦/xx咖啡厅…」
  let location = ''
  let title = rest.replace(/\s+/g, ' ').trim()
  const locM = title.match(/([\u4e00-\u9fa5A-Za-z0-9]*?(会议室|会议厅|办公室|咖啡厅|餐厅|大厦|中心|园区|校区|医院|机场|车站|图书馆|体育馆|室|楼|厅|馆|店|吧|站)[\u4e00-\u9fa5A-Za-z0-9]*)\s*$/)
  if (locM) {
    location = locM[1]
    title = title.replace(locM[0], '').trim()
  }

  return {
    title: title.replace(/[，。,\s]+$/, '').trim(),
    start_time: start ? start.toISOString() : null,
    end_time: end ? end.toISOString() : null,
    location
  }
}

/** 快速速记（笔记）：直接返回正文，标题取前15字 */
export function quickNoteTitle(content) {
  const t = content.replace(/[#*>\-\s]/g, '').trim()
  return t.slice(0, 15) || '未命名笔记'
}
