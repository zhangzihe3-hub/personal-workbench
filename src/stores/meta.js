/**
 * 分类与标签元数据（PRD 3.7.2）
 */
import { defineStore } from 'pinia'
import { db } from '@/db'

export const useMetaStore = defineStore('meta', {
  state: () => ({ categories: [], tags: [], loaded: false }),
  getters: {
    taskCategories: (s) => s.categories.filter(c => c.type === 'task').map(c => c.name),
    scheduleCategories: (s) => s.categories.filter(c => c.type === 'schedule').map(c => c.name),
    allTags: (s) => s.tags.map(t => t.name)
  },
  actions: {
    async load() {
      this.categories = await db.categories.toArray()
      this.tags = await db.tags.toArray()
      if (this.categories.length === 0) {
        // 默认分类
        const defaults = [
          { name: '工作', type: 'task' }, { name: '学习', type: 'task' },
          { name: '生活', type: 'task' }, { name: '待分类', type: 'task' },
          { name: '会议', type: 'schedule' }, { name: '约会', type: 'schedule' },
          { name: '个人', type: 'schedule' }, { name: '默认', type: 'schedule' }
        ]
        await db.categories.bulkPut(defaults)
        this.categories = defaults
      }
      this.loaded = true
    },
    async addCategory(name, type) {
      // categories 表以 name 为主键，因此分类名在任务/日程之间全局唯一。
      if (!name || this.categories.some(c => c.name === name)) return
      const row = { name, type }
      await db.categories.put(row)
      this.categories.push(row)
    },
    async removeCategory(name, type) {
      await db.categories.delete(name)
      this.categories = this.categories.filter(c => !(c.name === name && c.type === type))
    },
    async addTag(name, type = 'common') {
      if (!name || this.tags.some(t => t.name === name)) return
      const row = { name, type }
      await db.tags.put(row)
      this.tags.push(row)
    },
    async removeTag(name) {
      await db.tags.delete(name)
      this.tags = this.tags.filter(t => t.name !== name)
    },
    /** 合并标签：把 from 标签在所有实体中替换为 to */
    async mergeTag(from, to, { tasks = [], notes = [] } = {}) {
      await this.addTag(to)
      for (const t of tasks.filter(x => x.tags?.includes(from))) {
        t.tags = [...new Set([...t.tags.filter(g => g !== from), to])]
        await db.tasks.put(JSON.parse(JSON.stringify(t)))
      }
      for (const n of notes.filter(x => x.tags?.includes(from))) {
        n.tags = [...new Set([...n.tags.filter(g => g !== from), to])]
        await db.notes.put(JSON.parse(JSON.stringify(n)))
      }
      await this.removeTag(from)
    }
  }
})
