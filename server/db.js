import mysql from 'mysql2/promise'
import { config } from './config.js'

export const TABLE_KEYS = Object.freeze({
  tasks: 'task_id', schedules: 'schedule_id', notes: 'note_id', folders: 'name',
  tags: 'name', categories: 'name', goals: 'goal_id', habits: 'habit_id',
  habit_logs: 'log_id', favorites: 'fav_id', pomodoro_logs: 'log_id',
  configs: 'key', saved_views: 'view_id'
})
export const TABLES = Object.keys(TABLE_KEYS)

export const pool = mysql.createPool({
  ...config.mysql, waitForConnections: true, enableKeepAlive: true, charset: 'utf8mb4'
})

export async function initializeDatabase() {
  await pool.execute(`CREATE TABLE IF NOT EXISTS pwb_users (
    username VARCHAR(64) NOT NULL,
    display_name VARCHAR(100) NOT NULL DEFAULT '',
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'user',
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (username),
    INDEX idx_pwb_users_role_active (role, active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  await pool.execute(`CREATE TABLE IF NOT EXISTS pwb_sessions (
    session_id CHAR(36) NOT NULL,
    username VARCHAR(64) NOT NULL,
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    user_agent VARCHAR(500) NOT NULL DEFAULT '',
    issued_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expires_at TIMESTAMP(3) NOT NULL,
    last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    revoked_at TIMESTAMP(3) NULL,
    revoke_reason VARCHAR(100) NULL,
    PRIMARY KEY (session_id),
    INDEX idx_pwb_sessions_user (username, revoked_at),
    INDEX idx_pwb_sessions_online (revoked_at, expires_at, last_seen_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  await pool.execute(
    `DELETE FROM pwb_sessions
     WHERE expires_at < CURRENT_TIMESTAMP(3) - INTERVAL 30 DAY
        OR revoked_at < CURRENT_TIMESTAMP(3) - INTERVAL 30 DAY`
  )

  await pool.execute(`CREATE TABLE IF NOT EXISTS pwb_records (
    owner VARCHAR(191) NOT NULL,
    table_name VARCHAR(32) NOT NULL,
    record_key VARCHAR(255) NOT NULL,
    data JSON NOT NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (owner, table_name, record_key),
    INDEX idx_pwb_table_updated (owner, table_name, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
}

export function assertTable(table) {
  if (!TABLE_KEYS[table]) {
    const error = new Error('不支持的数据表')
    error.status = 404
    throw error
  }
}

export function recordKey(table, row) {
  const key = row?.[TABLE_KEYS[table]]
  if (key === undefined || key === null || key === '') {
    const error = new Error(`${table} 缺少主键 ${TABLE_KEYS[table]}`)
    error.status = 400
    throw error
  }
  return String(key)
}

export const parseData = value => typeof value === 'string' ? JSON.parse(value) : value

export async function upsert(connection, owner, table, row) {
  const key = recordKey(table, row)
  await connection.execute(
    `INSERT INTO pwb_records (owner, table_name, record_key, data) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP(3)`,
    [owner, table, key, JSON.stringify(row)]
  )
}
