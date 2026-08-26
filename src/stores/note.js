/**
 * 笔记模块状态（PRD 3.3）
 */
import { defineStore } from 'pinia'
import { db } from '@/db'
import { uuid } from '@/utils/id'
import { nowISO } from '@/utils/datetime'
import { quickNoteTitle } from '@/utils/nlp'

export function createNote(data = {}) {
  const now = nowISO()
  const content = data.content || ''
  return {
    note_id: data.note_id || uuid(),
    title: (data.title || quickNoteTitle(content)).slice(0, 200),
    content,
    folder: (data.folder || '临时笔记').slice(0, 50),
    tags: Array.isArray(data.tags) ? data.tags : [],
    related_task_ids: Array.isArray(data.related_task_ids) ? data.related_task_ids : [],
    related_schedule_ids: Array.isArray(data.related_schedule_ids) ? data.related_schedule_ids : [],
    word_count: countWords(content),
    created_at: data.created_at || now,
    updated_at: now
  }
}

export function countWords(content) {
  if (!content) return 0
  const text = content.replace(/[#*>\-`\[\]()!\s]/g, '')
  return text.length
}

export const useNoteStore = defineStore('note', {
  state: () => ({ notes: [], folders: [], loaded: false }),
  getters: {
    byId: (s) => (id) => s.notes.find(n => n.note_id === id),
    byFolder: (s) => (folder) => s.notes.filter(n => n.folder === folder),
    recentNotes: (s) => [...s.notes].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
    /** 反向查询：关联了某任务/日程的笔记 */
    linkedToTask: (s) => (taskId) => s.notes.filter(n => n.related_task_ids?.includes(taskId)),
    linkedToSchedule: (s) => (scheduleId) => s.notes.filter(n => n.related_schedule_ids?.includes(scheduleId))
  },
  actions: {
    async load() {
      this.notes = await db.notes.toArray()
      this.folders = await db.folders.toArray()
      if (!this.folders.some(f => f.name === '临时笔记')) {
        await this.addFolder('临时笔记')
      }
      this.loaded = true
    },
    async addNote(data) {
      const note = createNote(data)
      await db.notes.put(note)
      this.notes.push(note)
      return note
    },
    /** 快速速记：一句话保存为临时笔记 */
    async quickCapture(text) {
      return this.addNote({ content: text, folder: '临时笔记' })
    },
    async updateNote(id, patch) {
      const note = this.byId(id)
      if (!note) return null
      const before = JSON.parse(JSON.stringify(note))
      Object.assign(note, patch)
      if (patch.content !== undefined) {
        note.word_count = countWords(note.content)
        // 标题为空时自动取正文前15字
        if (!note.title || note.title === quickNoteTitle(before.content)) {
          note.title = quickNoteTitle(note.content)
        }
      }
      note.updated_at = nowISO()
      await db.notes.put(JSON.parse(JSON.stringify(note)))
      return { note, before }
    },
    async deleteNote(id) {
      await db.notes.delete(id)
      this.notes = this.notes.filter(n => n.note_id !== id)
    },
    async restoreNote(note) {
      await db.notes.put(JSON.parse(JSON.stringify(note)))
      if (!this.byId(note.note_id)) this.notes.push(note)
    },
    /** 文件夹管理（一级结构） */
    async addFolder(name) {
      if (!name || this.folders.some(f => f.name === name)) return
      const row = { name, created_at: nowISO() }
      await db.folders.put(row)
      this.folders.push(row)
    },
    async renameFolder(oldName, newName) {
      const row = this.folders.find(f => f.name === oldName)
      if (!row || !newName || this.folders.some(f => f.name === newName)) return
      await db.folders.delete(oldName)
      await db.folders.put({ name: newName, created_at: row.created_at })
      this.folders = this.folders.filter(f => f.name !== oldName)
      this.folders.push({ name: newName, created_at: row.created_at })
      for (const n of this.notes.filter(n => n.folder === oldName)) {
        n.folder = newName
        await db.notes.put(JSON.parse(JSON.stringify(n)))
      }
    },
    async deleteFolder(name) {
      // 文件夹下笔记移入「临时笔记」
      for (const n of this.notes.filter(n => n.folder === name)) {
        n.folder = '临时笔记'
        await db.notes.put(JSON.parse(JSON.stringify(n)))
      }
      await db.folders.delete(name)
      this.folders = this.folders.filter(f => f.name !== name)
    },
    /** 解析正文中的 [[标题]] 双链，返回匹配到的任务/日程标题列表 */
    parseLinks(content) {
      const links = []
      const re = /\[\[([^\]]+)\]\]/g
      let m
      while ((m = re.exec(content || '')) !== null) links.push(m[1].trim())
      return [...new Set(links)]
    }
  }
})
