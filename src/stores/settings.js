/**
 * 系统设置（PRD 3.7）— 单条全局配置
 */
import { defineStore } from 'pinia'
import { getConfig, setConfig } from '@/db'

export const DEFAULT_SETTINGS = {
  workStart: '09:00',          // 工作时间段
  workEnd: '18:00',
  defaultRemind: 15,           // 默认提醒分钟数（日程）
  defaultTaskRemind: 30,       // 默认任务截止提醒分钟数（0=不提醒）
  pomodoroWork: 25,            // 番茄钟工作时长（分钟）
  pomodoroBreak: 5,            // 番茄钟休息时长（分钟）
  theme: 'white',              // white / black / blue / green
  primaryColor: '#3b6fe0',     // 主色调
  autoLockMinutes: 0,          // 自动锁定：0=从不，5/10/30
  passwordHash: '',            // 解锁密码哈希（SHA-256）
  onboarded: false,            // 是否已完成新手引导
  sidebarCollapsed: false
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({ settings: { ...DEFAULT_SETTINGS }, locked: false, loaded: false }),
  actions: {
    async load() {
      const saved = await getConfig('app_settings', {})
      this.settings = { ...DEFAULT_SETTINGS, ...saved }
      this.locked = !!this.settings.passwordHash
      this.loaded = true
      this.applyTheme()
    },
    async update(patch) {
      Object.assign(this.settings, patch)
      await setConfig('app_settings', JSON.parse(JSON.stringify(this.settings)))
      if (patch.theme !== undefined) this.applyTheme()
    },
    applyTheme() {
      const legacyMap = { light: 'white', dark: 'black', system: 'white' }
      const mode = legacyMap[this.settings.theme] || this.settings.theme || 'white'
      const theme = ['white', 'black', 'blue', 'green'].includes(mode) ? mode : 'white'
      if (this.settings.theme !== theme) this.settings.theme = theme
      document.documentElement.dataset.theme = theme
      document.documentElement.classList.toggle('dark', theme === 'black')
      const primary = { white: '#2563eb', black: '#60a5fa', blue: '#2563eb', green: '#16a34a' }[theme]
      document.documentElement.style.setProperty('--pwb-primary', primary)
      document.documentElement.style.setProperty('--el-color-primary', primary)
      document.documentElement.style.colorScheme = theme === 'black' ? 'dark' : 'light'
    },
    unlock() { this.locked = false },
    lock() { if (this.settings.passwordHash) this.locked = true }
  }
})
