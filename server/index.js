import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config.js'
import {
  authenticateUser, createSession, ensureBootstrapAdmin, hashPassword,
  requireAdmin, requireAuth, validatePasswordChange, verifyPassword
} from './auth.js'
import { assertTable, initializeDatabase, parseData, pool, recordKey, TABLES, upsert } from './db.js'
import { getExchangeRate } from './exchange.js'

const app = express()
app.set('trust proxy', 1)
const allowedOrigins = new Set([
  'capacitor://localhost', 'http://localhost', 'https://localhost', ...config.corsOrigins
])

app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || process.env.NODE_ENV !== 'production') return callback(null, true)
    callback(new Error('不允许的跨域来源'))
  }
}))
app.use(express.json({ limit: '25mb' }))

const loginAttempts = new Map()
app.post('/api/auth/login', async (req, res, next) => {
  try {
  const key = req.ip
  const state = loginAttempts.get(key) || { count: 0, until: 0 }
  if (state.until > Date.now()) return res.status(429).json({ error: '尝试次数过多，请稍后重试' })
  const { username = '', password = '' } = req.body || {}
  const user = await authenticateUser(username, password)
  if (!user) {
    state.count += 1
    if (state.count >= 5) Object.assign(state, { count: 0, until: Date.now() + 5 * 60 * 1000 })
    loginAttempts.set(key, state)
    return res.status(401).json({ error: '用户名或密码错误' })
  }
  loginAttempts.delete(key)
  const session = await createSession(user, req)
  res.json({
    token: session.token,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    sessionId: session.sessionId,
    expiresInHours: config.tokenHours
  })
  } catch (error) { next(error) }
})

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'personal-workbench-api' }))
app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.auth))
app.use('/api', requireAuth)

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    await pool.execute(
      `UPDATE pwb_sessions SET revoked_at = CURRENT_TIMESTAMP(3), revoke_reason = '用户主动退出'
       WHERE session_id = ? AND revoked_at IS NULL`,
      [req.auth.sessionId]
    )
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/auth/change-password', async (req, res, next) => {
  const currentPassword = req.body?.currentPassword
  const newPassword = req.body?.newPassword
  const validationError = validatePasswordChange(currentPassword, newPassword)
  if (validationError) return res.status(400).json({ error: validationError })

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      'SELECT password_hash FROM pwb_users WHERE username = ? FOR UPDATE',
      [req.auth.username]
    )
    if (!rows[0] || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
      await connection.rollback()
      return res.status(400).json({ error: '当前登录密码不正确' })
    }

    const passwordHash = await hashPassword(newPassword)
    await connection.execute(
      'UPDATE pwb_users SET password_hash = ? WHERE username = ?',
      [passwordHash, req.auth.username]
    )
    const [revoked] = await connection.execute(
      `UPDATE pwb_sessions SET revoked_at = CURRENT_TIMESTAMP(3), revoke_reason = '用户修改密码'
       WHERE username = ? AND session_id <> ? AND revoked_at IS NULL`,
      [req.auth.username, req.auth.sessionId]
    )
    await connection.commit()
    res.json({ ok: true, revokedOtherSessions: Number(revoked.affectedRows || 0) })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally {
    connection.release()
  }
})

app.get('/api/admin/users', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.username, u.display_name AS displayName, u.role, u.active,
        u.created_at AS createdAt, u.updated_at AS updatedAt,
        COUNT(CASE WHEN s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP(3)
          AND s.last_seen_at > CURRENT_TIMESTAMP(3) - INTERVAL 2 MINUTE THEN 1 END) AS onlineSessions
       FROM pwb_users u LEFT JOIN pwb_sessions s ON s.username = u.username
       GROUP BY u.username, u.display_name, u.role, u.active, u.created_at, u.updated_at
       ORDER BY u.role = 'admin' DESC, u.created_at ASC`
    )
    res.json(rows.map(row => ({ ...row, active: Boolean(row.active), onlineSessions: Number(row.onlineSessions) })))
  } catch (error) { next(error) }
})

app.post('/api/admin/users', requireAdmin, async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    const displayName = String(req.body?.displayName || username).trim().slice(0, 100)
    const role = req.body?.role === 'admin' ? 'admin' : 'user'
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(username)) {
      return res.status(400).json({ error: '用户名需为 3-64 位字母、数字、点、下划线或短横线' })
    }
    if (password.length < 6) return res.status(400).json({ error: '密码至少需要 6 位' })
    const passwordHash = await hashPassword(password)
    await pool.execute(
      `INSERT INTO pwb_users (username, display_name, password_hash, role, active)
       VALUES (?, ?, ?, ?, 1)`,
      [username, displayName, passwordHash, role]
    )
    res.status(201).json({ username, displayName, role, active: true, onlineSessions: 0 })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '用户名已存在' })
    next(error)
  }
})

app.patch('/api/admin/users/:username', requireAdmin, async (req, res, next) => {
  try {
    const username = req.params.username
    const fields = []
    const params = []
    if (req.body?.displayName !== undefined) {
      fields.push('display_name = ?')
      params.push(String(req.body.displayName || username).trim().slice(0, 100))
    }
    if (req.body?.role !== undefined) {
      if (!['admin', 'user'].includes(req.body.role)) return res.status(400).json({ error: '用户角色无效' })
      if (username === req.auth.username && req.body.role !== 'admin') return res.status(400).json({ error: '不能取消自己的管理员权限' })
      fields.push('role = ?')
      params.push(req.body.role)
    }
    if (req.body?.active !== undefined) {
      if (username === req.auth.username && !req.body.active) return res.status(400).json({ error: '不能停用当前登录账号' })
      fields.push('active = ?')
      params.push(req.body.active ? 1 : 0)
    }
    if (!fields.length) return res.status(400).json({ error: '没有可修改的字段' })
    params.push(username)
    const [result] = await pool.execute(`UPDATE pwb_users SET ${fields.join(', ')} WHERE username = ?`, params)
    if (!result.affectedRows) return res.status(404).json({ error: '用户不存在' })
    if (req.body?.active === false) {
      await pool.execute(
        `UPDATE pwb_sessions SET revoked_at = CURRENT_TIMESTAMP(3), revoke_reason = '账号已停用'
         WHERE username = ? AND revoked_at IS NULL`,
        [username]
      )
    }
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/admin/users/:username/reset-password', requireAdmin, async (req, res, next) => {
  try {
    const password = String(req.body?.password || '')
    if (password.length < 6) return res.status(400).json({ error: '密码至少需要 6 位' })
    const passwordHash = await hashPassword(password)
    const [result] = await pool.execute('UPDATE pwb_users SET password_hash = ? WHERE username = ?', [passwordHash, req.params.username])
    if (!result.affectedRows) return res.status(404).json({ error: '用户不存在' })
    await pool.execute(
      `UPDATE pwb_sessions SET revoked_at = CURRENT_TIMESTAMP(3), revoke_reason = '密码已重置'
       WHERE username = ? AND revoked_at IS NULL AND session_id <> ?`,
      [req.params.username, req.auth.sessionId]
    )
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.get('/api/admin/sessions', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT s.session_id AS sessionId, s.username, u.display_name AS displayName,
        s.ip_address AS ipAddress, s.user_agent AS userAgent,
        s.issued_at AS issuedAt, s.last_seen_at AS lastSeenAt, s.expires_at AS expiresAt
       FROM pwb_sessions s JOIN pwb_users u ON u.username = s.username
       WHERE s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP(3)
       ORDER BY s.last_seen_at DESC LIMIT 500`
    )
    res.json(rows.map(row => ({
      ...row,
      online: new Date(row.lastSeenAt).getTime() > Date.now() - 2 * 60 * 1000
    })))
  } catch (error) { next(error) }
})

app.post('/api/admin/sessions/:sessionId/revoke', requireAdmin, async (req, res, next) => {
  try {
    if (req.params.sessionId === req.auth.sessionId) return res.status(400).json({ error: '请使用退出登录结束当前会话' })
    const [result] = await pool.execute(
      `UPDATE pwb_sessions SET revoked_at = CURRENT_TIMESTAMP(3), revoke_reason = '管理员强制下线'
       WHERE session_id = ? AND revoked_at IS NULL`,
      [req.params.sessionId]
    )
    if (!result.affectedRows) return res.status(404).json({ error: '会话不存在或已下线' })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.get('/api/tools/exchange-rate', async (req, res, next) => {
  try {
    res.json(await getExchangeRate(req.query.base, req.query.quote))
  } catch (error) {
    if (error.status) return next(error)
    console.error('获取汇率失败', error)
    res.status(502).json({ error: '暂时无法获取最新汇率，请稍后重试' })
  }
})

app.get('/api/data/:table', async (req, res, next) => {
  try {
    assertTable(req.params.table)
    const [rows] = await pool.execute(
      'SELECT data FROM pwb_records WHERE owner = ? AND table_name = ? ORDER BY updated_at ASC',
      [req.user, req.params.table]
    )
    res.json(rows.map(row => parseData(row.data)))
  } catch (error) { next(error) }
})

app.get('/api/data/:table/:key', async (req, res, next) => {
  try {
    assertTable(req.params.table)
    const [rows] = await pool.execute(
      'SELECT data FROM pwb_records WHERE owner = ? AND table_name = ? AND record_key = ?',
      [req.user, req.params.table, req.params.key]
    )
    if (!rows.length) return res.status(404).json({ error: '记录不存在' })
    res.json(parseData(rows[0].data))
  } catch (error) { next(error) }
})

app.put('/api/data/:table/:key', async (req, res, next) => {
  let connection
  try {
    assertTable(req.params.table)
    if (recordKey(req.params.table, req.body) !== String(req.params.key)) {
      return res.status(400).json({ error: 'URL 主键与记录主键不一致' })
    }
    connection = await pool.getConnection()
    await upsert(connection, req.user, req.params.table, req.body)
    res.json(req.body)
  } catch (error) { next(error) } finally { connection?.release() }
})

app.post('/api/data/:table/bulk', async (req, res, next) => {
  let connection
  try {
    const table = req.params.table
    assertTable(table)
    const rows = Array.isArray(req.body) ? req.body : []
    connection = await pool.getConnection()
    await connection.beginTransaction()
    for (const row of rows) await upsert(connection, req.user, table, row)
    await connection.commit()
    res.json({ count: rows.length })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally { connection?.release() }
})

app.delete('/api/data/:table/:key', async (req, res, next) => {
  try {
    assertTable(req.params.table)
    await pool.execute(
      'DELETE FROM pwb_records WHERE owner = ? AND table_name = ? AND record_key = ?',
      [req.user, req.params.table, req.params.key]
    )
    res.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/data/:table/bulk-delete', async (req, res, next) => {
  try {
    assertTable(req.params.table)
    const keys = Array.isArray(req.body?.keys) ? req.body.keys.map(String) : []
    if (keys.length) {
      const placeholders = keys.map(() => '?').join(',')
      await pool.execute(
        `DELETE FROM pwb_records WHERE owner = ? AND table_name = ? AND record_key IN (${placeholders})`,
        [req.user, req.params.table, ...keys]
      )
    }
    res.json({ count: keys.length })
  } catch (error) { next(error) }
})

app.delete('/api/data/:table', async (req, res, next) => {
  try {
    assertTable(req.params.table)
    await pool.execute('DELETE FROM pwb_records WHERE owner = ? AND table_name = ?', [req.user, req.params.table])
    res.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/export', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT table_name, data FROM pwb_records WHERE owner = ? ORDER BY table_name, updated_at', [req.user]
    )
    const tables = Object.fromEntries(TABLES.map(table => [table, []]))
    for (const row of rows) tables[row.table_name]?.push(parseData(row.data))
    res.json({ app: 'personal-workbench', version: 3, storage: 'mysql', exported_at: new Date().toISOString(), tables })
  } catch (error) { next(error) }
})

app.post('/api/import', async (req, res, next) => {
  let connection
  try {
    const json = req.body
    if (!json?.tables || typeof json.tables !== 'object') return res.status(400).json({ error: '数据格式不正确：缺少 tables 字段' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    for (const table of TABLES) {
      if (!Array.isArray(json.tables[table])) continue
      await connection.execute('DELETE FROM pwb_records WHERE owner = ? AND table_name = ?', [req.user, table])
      for (const row of json.tables[table]) await upsert(connection, req.user, table, row)
    }
    await connection.commit()
    res.json({ ok: true })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally { connection?.release() }
})

app.post('/api/clear', async (req, res, next) => {
  try {
    const tables = (Array.isArray(req.body?.tables) ? req.body.tables : TABLES).filter(x => TABLES.includes(x))
    if (tables.length) {
      const placeholders = tables.map(() => '?').join(',')
      await pool.execute(
        `DELETE FROM pwb_records WHERE owner = ? AND table_name IN (${placeholders})`, [req.user, ...tables]
      )
    }
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(error.status || 500).json({ error: error.status ? error.message : '服务器内部错误' })
})

async function start() {
  await initializeDatabase()
  await ensureBootstrapAdmin()
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`Personal Workbench API listening on :${config.port}`))
  const shutdown = signal => {
    console.log(`${signal} received, shutting down`)
    server.close(async () => {
      await pool.end()
      process.exit(0)
    })
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
}

start().catch(error => {
  console.error('API 启动失败', error)
  process.exitCode = 1
})
