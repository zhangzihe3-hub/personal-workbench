/**
 * 全局操作撤销栈（PRD 6.4：所有操作支持撤销，删除操作除外——本项目删除也可撤销恢复，属增强）
 * 用法：undoStore.push({ label, undo: async () => {}, redo: async () => {} })
 */
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'

const MAX_STACK = 50

export const useUndoStore = defineStore('undo', {
  state: () => ({ undoStack: [], redoStack: [] }),
  getters: {
    canUndo: (s) => s.undoStack.length > 0,
    canRedo: (s) => s.redoStack.length > 0
  },
  actions: {
    push(entry) {
      this.undoStack.push(entry)
      if (this.undoStack.length > MAX_STACK) this.undoStack.shift()
      this.redoStack = []
    },
    async undo() {
      const entry = this.undoStack.pop()
      if (!entry) return
      try {
        await entry.undo()
        this.redoStack.push(entry)
        ElMessage.success(`已撤销：${entry.label}`)
      } catch (e) {
        console.error('撤销失败', e)
        ElMessage.error('撤销失败')
      }
    },
    async redo() {
      const entry = this.redoStack.pop()
      if (!entry) return
      try {
        await entry.redo()
        this.undoStack.push(entry)
        ElMessage.success(`已重做：${entry.label}`)
      } catch (e) {
        console.error('重做失败', e)
        ElMessage.error('重做失败')
      }
    }
  }
})
