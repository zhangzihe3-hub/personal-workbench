import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { config } from './config.js'
import { pool } from './db.js'

const scrypt = promisify(crypto.scrypt)
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const sign = value => crypto.createHmac('sha256', config.tokenSecret).update(value).digest('base64url')
const safeEqual = (a, b) => {
  const left = Buffer.isBuffer(a) ? a : Buffer.from(String(a))
  const right = Buffer.isBuffer(b) ? b : Buffer.from(String(b))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = await scrypt(String(password), salt, 64)
  return `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`
}

export async function verifyPassword(password, encoded) {
  const [algorithm, salt, expected] = String(encoded || '').split('$')
  if (algorithm !== 'scrypt' || !salt || !expected) return false
  const derived = await scrypt(String(password), salt, 64)
  return safeEqual(Buffer.from(expected, 'hex'), Buffer.from(derived))
}

export function validatePasswordChange(currentPassword, newPassword) {
  if (typeof currentPassword !== 'string' || !currentPassword) return '请输入当前登录密码'
  if (typeof newPassword !== 'string' || newPassword.length < 6) return '新密码至少需要 6 位'
  if (newPassword.length > 128) return '新密码不能超过 128 位'
  if (currentPassword === newPassword) return '新密码不能与当前密码相同'
  return ''
}

export function createToken(username, options = {}) {
  const exp = options.expiresAt || Date.now() + config.tokenHours * 60 * 60 * 1000
  const payload = encode({ sub: username, role: options.role || 'user', sid: options.sessionId || '', exp })
  return `${payload}.${sign(payload)}`
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null
  const [payload, signature] = token.split('.')
  const expected = sign(payload)
  if (!safeEqual(signature, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return data.exp > Date.now() && data.sub ? data : null
  } catch { return null }
}

// 保留旧环境变量凭据比较，供兼容性检查；实际登录以 pwb_users 为准。
export function credentialsMatch(username, password) {
  return safeEqual(username, config.adminUsername) && safeEqual(password, config.adminPassword)
}

export async function ensureBootstrapAdmin() {
  const [rows] = await pool.execute('SELECT username FROM pwb_users WHERE username = ?', [config.adminUsername])
  if (rows.length) return
  const passwordHash = await hashPassword(config.adminPassword)
  await pool.execute(
    `INSERT INTO pwb_users (username, display_name, password_hash, role, active)
     VALUES (?, ?, ?, 'admin', 1)`,
    [config.adminUsername, '系统管理员', passwordHash]
  )
  console.log(`Created bootstrap administrator: ${config.adminUsername}`)
}

export async function authenticateUser(username, password) {
  const [rows] = await pool.execute(
    'SELECT username, display_name, password_hash, role, active FROM pwb_users WHERE username = ?',
    [String(username || '').trim()]
  )
  const user = rows[0]
  if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) return null
  return { username: user.username, displayName: user.display_name || user.username, role: user.role }
}

export async function createSession(user, req) {
  const sessionId = crypto.randomUUID()
  const expiresAt = Date.now() + config.tokenHours * 60 * 60 * 1000
  await pool.execute(
    `INSERT INTO pwb_sessions
      (session_id, username, ip_address, user_agent, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, FROM_UNIXTIME(? / 1000), CURRENT_TIMESTAMP(3))`,
    [sessionId, user.username, String(req.ip || '').slice(0, 64), String(req.headers['user-agent'] || '').slice(0, 500), expiresAt]
  )
  return { token: createToken(user.username, { role: user.role, sessionId, expiresAt }), sessionId, expiresAt }
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const data = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : '')
    if (!data?.sid) return res.status(401).json({ error: '登录已失效，请重新登录', code: 'SESSION_EXPIRED' })
    const [rows] = await pool.execute(
      `SELECT u.username, u.display_name, u.role, u.active, s.session_id
       FROM pwb_sessions s JOIN pwb_users u ON u.username = s.username
       WHERE s.session_id = ? AND s.username = ? AND s.revoked_at IS NULL
         AND s.expires_at > CURRENT_TIMESTAMP(3)`,
      [data.sid, data.sub]
    )
    const user = rows[0]
    if (!user?.active) return res.status(401).json({ error: '账号已停用或会话已被强制下线', code: 'SESSION_REVOKED' })
    req.user = user.username
    req.auth = {
      username: user.username,
      displayName: user.display_name || user.username,
      role: user.role,
      sessionId: user.session_id
    }
    await pool.execute(
      `UPDATE pwb_sessions SET last_seen_at = CURRENT_TIMESTAMP(3), ip_address = ?, user_agent = ?
       WHERE session_id = ?`,
      [String(req.ip || '').slice(0, 64), String(req.headers['user-agent'] || '').slice(0, 500), data.sid]
    )
    next()
  } catch (error) { next(error) }
}

export function requireAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') return res.status(403).json({ error: '仅管理员可执行此操作' })
  next()
}
