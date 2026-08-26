import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  expandSchedules,
  rebaseRecurringPatchToMaster,
  scheduleInstanceTimes
} from '../src/stores/schedule.js'
import { useUiStore } from '../src/stores/ui.js'

const master = {
  schedule_id: 'weekly-1',
  title: '周会',
  start_time: '2026-08-04T14:00:00+08:00',
  end_time: '2026-08-04T16:00:00+08:00',
  repeat_type: 'weekly',
  repeat_end: null,
  canceled_dates: []
}

describe('重复日程实例编辑', () => {
  it('按点击日期生成正确的实例起止时间', () => {
    const result = scheduleInstanceTimes(master, '2026-08-18')
    expect(result.start_time).toContain('2026-08-18T06:00:00.000Z')
    expect(result.end_time).toContain('2026-08-18T08:00:00.000Z')
  })

  it('应用到全部时将实例时间变更回基到主记录', () => {
    const result = rebaseRecurringPatchToMaster(master, '2026-08-18', {
      start_time: '2026-08-18T15:00:00+08:00',
      end_time: '2026-08-18T17:30:00+08:00'
    })
    expect(result.start_time).toContain('2026-08-04T07:00:00.000Z')
    expect(result.end_time).toContain('2026-08-04T09:30:00.000Z')
  })

  it('展开结果保留每次实例日期，供详情面板精确定位', () => {
    const result = expandSchedules(
      [master],
      '2026-08-17T00:00:00+08:00',
      '2026-08-19T00:00:00+08:00'
    )
    expect(result).toHaveLength(1)
    expect(result[0]._instance_date).toBe('2026-08-18')
    expect(result[0]._master_id).toBe(master.schedule_id)
  })
})

describe('详情面板上下文', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('打开重复实例时保存实例日期', () => {
    const store = useUiStore()
    store.openDetail('schedule', master.schedule_id, { instanceDate: '2026-08-18' })
    expect(store.detailPanel).toEqual({
      visible: true,
      type: 'schedule',
      id: master.schedule_id,
      context: { instanceDate: '2026-08-18' }
    })
  })
})
