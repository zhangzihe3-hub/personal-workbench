/**
 * 服务器数据层：保持原 Store 的 Dexie 风格调用接口，实际通过 REST API 写入 MySQL。
 * Web 与 Android 共用完整业务逻辑，旧版 JSON 备份可直接导入。
 */
import { apiFetch } from '@/services/api'

export const DB_VERSION = 3
export const TABLE_KEYS = {
  tasks: 'task_id', schedules: 'schedule_id', notes: 'note_id', folders: 'name',
  tags: 'name', categories: 'name', goals: 'goal_id', habits: 'habit_id',
  habit_logs: 'log_id', favorites: 'fav_id', pomodoro_logs: 'log_id',
  configs: 'key', saved_views: 'view_id'
}
export const ALL_TABLES = Object.keys(TABLE_KEYS)
const notificationTables = new Set(['tasks', 'schedules', 'configs'])
let notificationRefreshTimer = null
function scheduleNotificationRefresh(table) {
  if (!notificationTables.has(table) || typeof window === 'undefined') return
  window.clearTimeout(notificationRefreshTimer)
  notificationRefreshTimer = window.setTimeout(() => window.dispatchEvent(new CustomEvent('pwb:notifications-refresh')), 0)
}

class RemoteTable {
  constructor(name) {
    this.name = name
    this.keyField = TABLE_KEYS[name]
  }

  async toArray() { return apiFetch(`/data/${this.name}`) }

  async get(key) {
    try { return await apiFetch(`/data/${this.name}/${encodeURIComponent(String(key))}`) }
    catch (error) { if (error.status === 404) return undefined; throw error }
  }

  async put(row) {
    const key = row?.[this.keyField]
    if (key === undefined || key === null) throw new Error(`${this.name} 缺少主键 ${this.keyField}`)
    const result = await apiFetch(`/data/${this.name}/${encodeURIComponent(String(key))}`, {
      method: 'PUT', body: JSON.stringify(row)
    })
    scheduleNotificationRefresh(this.name)
    return result
  }

  async bulkPut(rows) {
    const result = await apiFetch(`/data/${this.name}/bulk`, { method: 'POST', body: JSON.stringify(rows) })
    scheduleNotificationRefresh(this.name)
    return result
  }

  async delete(key) {
    const result = await apiFetch(`/data/${this.name}/${encodeURIComponent(String(key))}`, { method: 'DELETE' })
    scheduleNotificationRefresh(this.name)
    return result
  }

  async bulkDelete(keys) {
    const result = await apiFetch(`/data/${this.name}/bulk-delete`, {
      method: 'POST', body: JSON.stringify({ keys })
    })
    scheduleNotificationRefresh(this.name)
    return result
  }

  async clear() {
    const result = await apiFetch(`/data/${this.name}`, { method: 'DELETE' })
    scheduleNotificationRefresh(this.name)
    return result
  }

  where(field) {
    return {
      equals: value => ({
        delete: async () => {
          const rows = await this.toArray()
          const keys = rows.filter(row => row?.[field] === value).map(row => row[this.keyField])
          return this.bulkDelete(keys)
        }
      })
    }
  }
}

export const db = Object.fromEntries(ALL_TABLES.map(name => [name, new RemoteTable(name)]))
db.table = name => {
  if (!db[name]) throw new Error(`未知数据表：${name}`)
  return db[name]
}
db.transaction = async (_mode, _tables, callback) => callback()

export async function exportAllData() { return apiFetch('/export') }

export async function importAllData(json) {
  if (!json || typeof json !== 'object' || !json.tables) throw new Error('数据格式不正确：缺少 tables 字段')
  return apiFetch('/import', { method: 'POST', body: JSON.stringify(json) })
}

export async function clearAllData({ keepConfigs = true } = {}) {
  const tables = keepConfigs ? ALL_TABLES.filter(table => table !== 'configs') : ALL_TABLES
  return apiFetch('/clear', { method: 'POST', body: JSON.stringify({ tables }) })
}

export async function getConfig(key, defaultValue = null) {
  const row = await db.configs.get(key)
  return row ? row.value : defaultValue
}

export async function setConfig(key, value) {
  await db.configs.put({ key, value })
}
