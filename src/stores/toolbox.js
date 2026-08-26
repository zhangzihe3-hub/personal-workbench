/**
 * 快捷工具箱数据（PRD 3.5）：收藏夹 + 番茄钟专注记录
 */
import { defineStore } from 'pinia'
import { db } from '@/db'
import { uuid } from '@/utils/id'
import { nowISO, dayjs } from '@/utils/datetime'

export const useToolboxStore = defineStore('toolbox', {
  state: () => ({ favorites: [], pomodoroLogs: [], loaded: false }),
  getters: {
    /** 今日专注总分钟数 */
    todayFocusMinutes: (s) => {
      const today = dayjs().format('YYYY-MM-DD')
      return s.pomodoroLogs
        .filter(l => dayjs(l.start_time).format('YYYY-MM-DD') === today)
        .reduce((sum, l) => sum + (l.minutes || 0), 0)
    },
    totalFocusMinutes: (s) => s.pomodoroLogs.reduce((sum, l) => sum + (l.minutes || 0), 0)
  },
  actions: {
    async load() {
      this.favorites = await db.favorites.toArray()
      this.pomodoroLogs = await db.pomodoro_logs.toArray()
      this.loaded = true
    },
    /** favorite: {fav_id, type(url/file/text), title, content, created_at} */
    async addFavorite(data) {
      const fav = {
        fav_id: uuid(),
        type: ['url', 'file', 'text'].includes(data.type) ? data.type : 'url',
        title: (data.title || '').slice(0, 100),
        content: data.content || '',
        created_at: nowISO()
      }
      await db.favorites.put(fav)
      this.favorites.push(fav)
      return fav
    },
    async deleteFavorite(id) {
      await db.favorites.delete(id)
      this.favorites = this.favorites.filter(f => f.fav_id !== id)
    },
    /** 记录一次专注：{log_id, task_id(nullable), minutes, start_time} */
    async logFocus({ taskId = null, minutes, startTime = nowISO() }) {
      const log = { log_id: uuid(), task_id: taskId, minutes, start_time: startTime }
      await db.pomodoro_logs.put(log)
      this.pomodoroLogs.push(log)
      return log
    }
  }
})
