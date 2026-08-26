/**
 * 目标与习惯追踪（PRD 3.6）
 */
import { defineStore } from 'pinia'
import { db } from '@/db'
import { uuid } from '@/utils/id'
import { nowISO, dayjs, dateKey } from '@/utils/datetime'

export const useGoalStore = defineStore('goal', {
  state: () => ({ goals: [], habits: [], habitLogs: [], loaded: false }),
  getters: {
    goalById: (s) => (id) => s.goals.find(g => g.goal_id === id),
    habitById: (s) => (id) => s.habits.find(h => h.habit_id === id),
    logsOf: (s) => (habitId) => s.habitLogs.filter(l => l.habit_id === habitId),
    isCheckedToday: (s) => (habitId) =>
      s.habitLogs.some(l => l.habit_id === habitId && l.date === dateKey(new Date())),
    /** 连续打卡天数（截至今天/昨天） */
    streak: (s) => (habitId) => {
      const dates = new Set(s.habitLogs.filter(l => l.habit_id === habitId).map(l => l.date))
      let streak = 0
      let d = dayjs()
      if (!dates.has(d.format('YYYY-MM-DD'))) d = d.subtract(1, 'day')
      while (dates.has(d.format('YYYY-MM-DD'))) {
        streak++
        d = d.subtract(1, 'day')
      }
      return streak
    },
    /** 目标完成度：按关联任务完成比例 */
    goalProgress: (s) => (goal) => {
      const krs = goal.key_results || []
      if (krs.length === 0) return goal.status === 'done' ? 100 : 0
      const done = krs.filter(k => k.done).length
      return Math.round((done / krs.length) * 100)
    }
  },
  actions: {
    async load() {
      this.goals = await db.goals.toArray()
      this.habits = await db.habits.toArray()
      this.habitLogs = await db.habit_logs.toArray()
      this.loaded = true
    },
    /** 目标 CRUD。goal: {goal_id, title, description, period(week/month/quarter/year), metric, deadline, key_results:[{kr_id,title,done,related_task_ids}], status(active/done), created_at, updated_at} */
    async addGoal(data) {
      const now = nowISO()
      const goal = {
        goal_id: uuid(),
        title: (data.title || '').slice(0, 200),
        description: data.description || '',
        period: ['week', 'month', 'quarter', 'year'].includes(data.period) ? data.period : 'month',
        metric: data.metric || '',
        deadline: data.deadline || null,
        key_results: Array.isArray(data.key_results) ? data.key_results : [],
        status: 'active',
        created_at: now,
        updated_at: now
      }
      await db.goals.put(goal)
      this.goals.push(goal)
      return goal
    },
    async updateGoal(id, patch) {
      const goal = this.goalById(id)
      if (!goal) return
      Object.assign(goal, patch, { updated_at: nowISO() })
      await db.goals.put(JSON.parse(JSON.stringify(goal)))
    },
    async deleteGoal(id) {
      await db.goals.delete(id)
      this.goals = this.goals.filter(g => g.goal_id !== id)
    },
    /** 习惯 CRUD。habit: {habit_id, title, frequency_type(daily/weekly), weekly_days([1..7]), remind_time(HH:mm), status(active/archived), created_at} */
    async addHabit(data) {
      const habit = {
        habit_id: uuid(),
        title: (data.title || '').slice(0, 100),
        frequency_type: data.frequency_type === 'weekly' ? 'weekly' : 'daily',
        weekly_days: Array.isArray(data.weekly_days) ? data.weekly_days : [1, 2, 3, 4, 5],
        remind_time: data.remind_time || '20:00',
        status: 'active',
        created_at: nowISO()
      }
      await db.habits.put(habit)
      this.habits.push(habit)
      return habit
    },
    async updateHabit(id, patch) {
      const habit = this.habitById(id)
      if (!habit) return
      Object.assign(habit, patch)
      await db.habits.put(JSON.parse(JSON.stringify(habit)))
    },
    async deleteHabit(id) {
      await db.habits.delete(id)
      await db.habit_logs.where('habit_id').equals(id).delete()
      this.habits = this.habits.filter(h => h.habit_id !== id)
      this.habitLogs = this.habitLogs.filter(l => l.habit_id !== id)
    },
    /** 打卡/补打卡（幂等：同一天重复打卡无效），再次调用取消打卡 */
    async toggleCheckIn(habitId, date = dateKey(new Date())) {
      const existing = this.habitLogs.find(l => l.habit_id === habitId && l.date === date)
      if (existing) {
        await db.habit_logs.delete(existing.log_id)
        this.habitLogs = this.habitLogs.filter(l => l.log_id !== existing.log_id)
        return false
      }
      const log = { log_id: uuid(), habit_id: habitId, date, checked_at: nowISO() }
      await db.habit_logs.put(log)
      this.habitLogs.push(log)
      return true
    }
  }
})
