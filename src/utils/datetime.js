/**
 * 日期时间工具：统一封装 dayjs，全项目使用 ISO 字符串交换数据
 */
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import isoWeek from 'dayjs/plugin/isoWeek'

dayjs.extend(isBetween)
dayjs.extend(isoWeek)

export { dayjs }

export function nowISO() {
  return dayjs().toISOString()
}

export function toISO(date) {
  return date ? dayjs(date).toISOString() : null
}

/** YYYY-MM-DD */
export function dateKey(date) {
  return dayjs(date).format('YYYY-MM-DD')
}

/** YYYY-MM-DD HH:mm */
export function fmtDateTime(date) {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm') : ''
}

export function fmtTime(date) {
  return date ? dayjs(date).format('HH:mm') : ''
}

export function fmtDate(date) {
  return date ? dayjs(date).format('YYYY-MM-DD') : ''
}

/** 今天开始/结束 ISO */
export function todayRange() {
  return [dayjs().startOf('day').toISOString(), dayjs().endOf('day').toISOString()]
}

/** 本周（周一开始） */
export function weekRange(base = dayjs()) {
  return [base.startOf('isoWeek').toISOString(), base.endOf('isoWeek').toISOString()]
}

/** 本月 */
export function monthRange(base = dayjs()) {
  return [base.startOf('month').toISOString(), base.endOf('month').toISOString()]
}

/** 判断日期是否是今天 */
export function isToday(date) {
  return dayjs(date).isSame(dayjs(), 'day')
}

/** 是否已过期（早于当前时间） */
export function isPast(date) {
  return date ? dayjs(date).isBefore(dayjs()) : false
}

/** 两个 ISO 时间段是否重叠：A.end > B.start 且 A.start < B.end */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return dayjs(aEnd).isAfter(dayjs(bStart)) && dayjs(aStart).isBefore(dayjs(bEnd))
}

/** 时长（分钟） */
export function durationMinutes(start, end) {
  return dayjs(end).diff(dayjs(start), 'minute')
}

/**
 * 计算两个日期间的工作日天数（周一至周五，不含法定节假日）
 */
export function workdaysBetween(startDate, endDate) {
  let cur = dayjs(startDate).startOf('day')
  let end = dayjs(endDate).startOf('day')
  if (cur.isAfter(end)) { const t = cur; cur = end; end = t }
  let count = 0
  let d = cur
  while (!d.isAfter(end)) {
    const dow = d.day()
    if (dow >= 1 && dow <= 5) count++
    d = d.add(1, 'day')
  }
  return count
}
