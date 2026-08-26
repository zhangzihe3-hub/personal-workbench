/**
 * 全局 UI 状态：右侧详情面板、全局搜索弹窗、快速新建、新手引导
 */
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    detailPanel: { visible: false, type: null, id: null, context: null }, // type: task/schedule/note
    searchVisible: false,
    quickTaskVisible: false,
    quickNoteVisible: false,
    onboardingVisible: false,
    reminderPopup: null // {schedule} 页面内提醒弹窗
  }),
  actions: {
    openDetail(type, id, context = null) {
      this.detailPanel = { visible: true, type, id, context }
    },
    closeDetail() {
      this.detailPanel.visible = false
    },
    openSearch() { this.searchVisible = true },
    closeSearch() { this.searchVisible = false },
    /** Esc 逐层关闭：返回是否消费了该事件 */
    handleEscape() {
      if (this.reminderPopup) { this.reminderPopup = null; return true }
      if (this.searchVisible) { this.closeSearch(); return true }
      if (this.quickTaskVisible) { this.quickTaskVisible = false; return true }
      if (this.quickNoteVisible) { this.quickNoteVisible = false; return true }
      if (this.detailPanel.visible) { this.closeDetail(); return true }
      return false
    }
  }
})
