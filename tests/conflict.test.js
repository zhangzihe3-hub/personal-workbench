import { describe, it, expect } from 'vitest'
import { findConflicts, hasConflict } from '../src/utils/conflict.js'

const s = (id, start, end) => ({ schedule_id: id, start_time: `2026-08-05T${start}:00`, end_time: `2026-08-05T${end}:00` })

describe('日程冲突检测', () => {
  const existing = [s('a', '10:00', '11:00'), s('b', '14:00', '15:00')]

  it('重叠判定：A.end > B.start 且 A.start < B.end', () => {
    expect(hasConflict(s('x', '10:30', '11:30'), existing)).toBe(true)
    expect(hasConflict(s('x', '09:30', '10:30'), existing)).toBe(true)
    expect(hasConflict(s('x', '09:00', '10:00'), existing)).toBe(false) // 首尾相接不冲突
    expect(hasConflict(s('x', '11:00', '12:00'), existing)).toBe(false)
  })

  it('排除自身', () => {
    expect(findConflicts(s('a', '10:00', '11:00'), existing)).toHaveLength(0)
  })

  it('返回全部冲突项', () => {
    const conflicts = findConflicts(s('x', '09:00', '16:00'), existing)
    expect(conflicts.map(c => c.schedule_id)).toEqual(['a', 'b'])
  })
})
