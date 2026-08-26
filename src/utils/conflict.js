/**
 * 日程时间冲突检测（纯函数）
 * 冲突判定规则：A.end_time > B.start_time 且 A.start_time < B.end_time
 */
import { rangesOverlap } from './datetime'

/**
 * 检测目标日程与日程列表中的冲突项
 * @param {{start_time:string, end_time:string, schedule_id?:string}} target
 * @param {Array} schedules 候选日程列表
 * @returns {Array} 冲突的日程数组
 */
export function findConflicts(target, schedules) {
  if (!target?.start_time || !target?.end_time) return []
  return schedules.filter(s => {
    if (s.schedule_id && s.schedule_id === target.schedule_id) return false
    return rangesOverlap(target.start_time, target.end_time, s.start_time, s.end_time)
  })
}

export function hasConflict(target, schedules) {
  return findConflicts(target, schedules).length > 0
}
