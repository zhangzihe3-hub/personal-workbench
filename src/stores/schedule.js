/**
 * 日程模块状态（PRD 3.2）
 * 重复日程展开策略：主记录存 repeat_type，视图渲染时按区间展开为实例；
 * 对「仅本次」的修改/删除生成例外记录（repeat_type='exception'，exception_of 指向主日程）。
 */
import { defineStore } from 'pinia'
import { db } from '@/db'
import { uuid } from '@/utils/id'
import { nowISO, dayjs } from '@/utils/datetime'

export function createSchedule(data = {}) {
  const now = nowISO()
  return {
    schedule_id: data.schedule_id || uuid(),
    title: (data.title || '').slice(0, 200),
    start_time: data.start_time,
    end_time: data.end_time,
    location: (data.location || '').slice(0, 200),
    attendees: Array.isArray(data.attendees) ? data.attendees : [],
    remind_minutes: Number.isInteger(data.remind_minutes) ? data.remind_minutes : 15,
    repeat_type: ['none', 'daily', 'weekly', 'monthly', 'yearly', 'exception'].includes(data.repeat_type) ? data.repeat_type : 'none',
    repeat_end: data.repeat_end || null, // 重复结束日期 ISO，null = 永不结束
    exception_of: data.exception_of || null, // 例外实例指向的主日程ID
    exception_date: data.exception_date || null, // 例外对应的原始日期 YYYY-MM-DD
    canceled_dates: Array.isArray(data.canceled_dates) ? data.canceled_dates : [], // 主日程上记录的跳过日期
    category: data.category || '默认',
    remark: data.remark || '',
    related_task_ids: Array.isArray(data.related_task_ids) ? data.related_task_ids : [],
    created_at: data.created_at || now,
    updated_at: now,
    reminded_at: data.reminded_at || null // 上次提醒触发时间，避免重复提醒
  }
}

/** 将日程（含重复规则）展开为指定时间区间内的实例列表 */
export function expandSchedules(schedules, rangeStart, rangeEnd) {
  const out = []
  const rs = dayjs(rangeStart)
  const re = dayjs(rangeEnd)
  for (const s of schedules) {
    if (s.repeat_type === 'exception') {
      if (dayjs(s.start_time).isBefore(re) && dayjs(s.end_time).isAfter(rs)) out.push(s)
      continue
    }
    if (s.repeat_type === 'none') {
      if (dayjs(s.start_time).isBefore(re) && dayjs(s.end_time).isAfter(rs)) out.push(s)
      continue
    }
    // 重复日程展开
    const unitMap = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }
    const unit = unitMap[s.repeat_type]
    if (!unit) continue
    const dur = dayjs(s.end_time).diff(dayjs(s.start_time))
    let inst = dayjs(s.start_time)
    const repeatEnd = s.repeat_end ? dayjs(s.repeat_end).endOf('day') : re
    let guard = 0
    while (inst.isBefore(re) && guard < 800) {
      guard++
      if (inst.isAfter(repeatEnd)) break
      const instEnd = inst.add(dur, 'millisecond')
      if (instEnd.isAfter(rs)) {
        const dateKeyStr = inst.format('YYYY-MM-DD')
        const hasException = schedules.some(x => x.exception_of === s.schedule_id && x.exception_date === dateKeyStr)
        const canceled = (s.canceled_dates || []).includes(dateKeyStr)
        if (!hasException && !canceled) {
          out.push({ ...s, start_time: inst.toISOString(), end_time: instEnd.toISOString(), _instance_date: dateKeyStr, _master_id: s.schedule_id })
        }
      }
      inst = inst.add(1, unit)
    }
  }
  return out.sort((a, b) => (a.start_time < b.start_time ? -1 : 1))
}

/** 计算重复日程某个实例的实际起止时间。 */
export function scheduleInstanceTimes(master, instanceDate) {
  const masterStart = dayjs(master.start_time)
  const duration = dayjs(master.end_time).diff(masterStart)
  const start = dayjs(instanceDate)
    .hour(masterStart.hour())
    .minute(masterStart.minute())
    .second(masterStart.second())
    .millisecond(masterStart.millisecond())
  return {
    start_time: start.toISOString(),
    end_time: start.add(duration, 'millisecond').toISOString()
  }
}

/**
 * 从某次实例编辑结果反推主记录时间：保留用户对实例做出的时间偏移和新时长，
 * 但不把主记录锚点错误移动到该实例所在日期。
 */
export function rebaseRecurringPatchToMaster(master, instanceDate, patch) {
  if (!instanceDate || !patch.start_time || !patch.end_time) return patch
  const instance = scheduleInstanceTimes(master, instanceDate)
  const startDelta = dayjs(patch.start_time).diff(dayjs(instance.start_time))
  const duration = dayjs(patch.end_time).diff(dayjs(patch.start_time))
  const masterStart = dayjs(master.start_time).add(startDelta, 'millisecond')
  return {
    ...patch,
    start_time: masterStart.toISOString(),
    end_time: masterStart.add(duration, 'millisecond').toISOString()
  }
}

export const useScheduleStore = defineStore('schedule', {
  state: () => ({ schedules: [], loaded: false }),
  getters: {
    byId: (s) => (id) => s.schedules.find(x => x.schedule_id === id),
    todaySchedules(s) {
      const start = dayjs().startOf('day')
      const end = dayjs().endOf('day')
      return expandSchedules(s.schedules, start, end)
    }
  },
  actions: {
    async load() {
      this.schedules = await db.schedules.toArray()
      this.loaded = true
    },
    async addSchedule(data) {
      const sch = createSchedule(data)
      await db.schedules.put(sch)
      this.schedules.push(sch)
      return sch
    },
    async updateSchedule(id, patch) {
      const sch = this.byId(id)
      if (!sch) return null
      const before = JSON.parse(JSON.stringify(sch))
      Object.assign(sch, patch, { updated_at: nowISO() })
      await db.schedules.put(JSON.parse(JSON.stringify(sch)))
      return { sch, before }
    },
    /**
     * 删除日程
     * @param scope 'this' 仅本次 | 'future' 本次及未来 | 'all' 全部
     * @param instanceDate 实例日期 YYYY-MM-DD（删除重复日程某次时必传）
     */
    async deleteSchedule(id, scope = 'all', instanceDate = null) {
      const sch = this.byId(id)
      if (!sch) return
      if (sch.repeat_type === 'exception' || scope === 'all' || sch.repeat_type === 'none') {
        await db.schedules.delete(id)
        this.schedules = this.schedules.filter(x => x.schedule_id !== id)
        return
      }
      if (scope === 'this' && instanceDate) {
        sch.canceled_dates = [...(sch.canceled_dates || []), instanceDate]
        sch.updated_at = nowISO()
        await db.schedules.put(JSON.parse(JSON.stringify(sch)))
      } else if (scope === 'future' && instanceDate) {
        sch.repeat_end = dayjs(instanceDate).subtract(1, 'day').endOf('day').toISOString()
        sch.updated_at = nowISO()
        await db.schedules.put(JSON.parse(JSON.stringify(sch)))
      }
    },
    async restoreSchedule(sch) {
      await db.schedules.put(JSON.parse(JSON.stringify(sch)))
      if (!this.byId(sch.schedule_id)) this.schedules.push(sch)
    },
    /** 编辑重复日程的某一次 → 生成例外实例 */
    async editInstance(masterId, instanceDate, patch) {
      const master = this.byId(masterId)
      if (!master) return null
      const dur = dayjs(master.end_time).diff(dayjs(master.start_time))
      const instStart = dayjs(instanceDate).hour(dayjs(master.start_time).hour()).minute(dayjs(master.start_time).minute())
      const inst = createSchedule({
        ...master,
        schedule_id: uuid(),
        repeat_type: 'exception',
        exception_of: masterId,
        exception_date: instanceDate,
        start_time: instStart.toISOString(),
        end_time: instStart.add(dur, 'millisecond').toISOString(),
        ...patch,
        // 强制覆盖：例外实例必须为 exception 类型，防止 patch 误带重复规则
        repeat_type: 'exception',
        repeat_end: null,
        exception_of: masterId,
        exception_date: instanceDate
      })
      delete inst._instance_date
      delete inst._master_id
      // master 来自 Pinia 响应式状态，先转为普通对象，确保 REST 序列化结果稳定。
      const plainInst = JSON.parse(JSON.stringify(inst))
      await db.schedules.put(plainInst)
      this.schedules.push(plainInst)
      return plainInst
    },
    async markReminded(id) {
      const sch = this.byId(id)
      if (sch) {
        sch.reminded_at = nowISO()
        await db.schedules.put(JSON.parse(JSON.stringify(sch)))
      }
    }
  }
})
