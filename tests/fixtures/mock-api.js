import http from 'node:http'
import crypto from 'node:crypto'

const keyFields = {
  tasks: 'task_id', schedules: 'schedule_id', notes: 'note_id', folders: 'name', tags: 'name',
  categories: 'name', goals: 'goal_id', habits: 'habit_id', habit_logs: 'log_id', favorites: 'fav_id',
  pomodoro_logs: 'log_id', configs: 'key', saved_views: 'view_id'
}
const users = new Map([
  ['admin', { username: 'admin', displayName: '系统管理员', password: 'change-me-now', role: 'admin', active: true, createdAt: new Date().toISOString() }],
  ['member', { username: 'member', displayName: '测试用户', password: 'member123', role: 'user', active: true, createdAt: new Date().toISOString() }]
])
const ownedTables = new Map()
const sessions = new Map()

function tablesFor(owner) {
  if (!ownedTables.has(owner)) ownedTables.set(owner, new Map(Object.keys(keyFields).map(name => [name, new Map()])))
  return ownedTables.get(owner)
}

function seedOwner(owner, taskId, title, status = 'todo') {
  const tables = tablesFor(owner)
  const now = new Date().toISOString()
  tables.get('tasks').set(taskId, {
    task_id: taskId, title, description: '', important: false, urgent: false, status,
    start_time: null, deadline: null, category: '待分类', tags: [], subtasks: [],
    related_schedule_ids: [], related_note_ids: [], repeat_type: 'none', repeat_end: null,
    canceled_dates: [], completed_dates: [], remind_minutes: null, pinned: false,
    sort_order: Date.now(), created_at: now, updated_at: now, completed_at: status === 'done' ? now : null
  })
  tables.get('configs').set('app_settings', {
    key: 'app_settings',
    value: { onboarded: true, theme: 'white', defaultRemind: 15, defaultTaskRemind: 30 }
  })
}

seedOwner('admin', 'admin-private', '管理员私有任务')
seedOwner('admin', 'admin-completed', '已完成的部署检查', 'done')
seedOwner('member', 'member-private', '普通用户私有任务')

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

function currentSession(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '')
  const session = sessions.get(token)
  return session && !session.revoked ? session : null
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204)
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
  const path = new URL(req.url, 'http://localhost').pathname
  if (path === '/api/health') return json(res, 200, { ok: true })

  if (path === '/api/auth/login' && req.method === 'POST') {
    const user = users.get(body?.username)
    if (!user || !user.active || user.password !== body?.password) return json(res, 401, { error: '用户名或密码错误' })
    const token = `browser-token-${crypto.randomUUID()}`
    const session = {
      sessionId: crypto.randomUUID(), username: user.username, displayName: user.displayName, role: user.role,
      token, ipAddress: '127.0.0.1', userAgent: req.headers['user-agent'] || 'Browser QA',
      issuedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), online: true
    }
    sessions.set(token, session)
    return json(res, 200, { token, username: user.username, displayName: user.displayName, role: user.role, sessionId: session.sessionId })
  }

  const auth = currentSession(req)
  if (!auth) return json(res, 401, { error: '登录已失效，请重新登录' })
  auth.lastSeenAt = new Date().toISOString()
  const user = users.get(auth.username)
  if (!user?.active) return json(res, 401, { error: '账号已停用或会话已被强制下线' })
  if (path === '/api/auth/me') return json(res, 200, { username: auth.username, displayName: auth.displayName, role: auth.role, sessionId: auth.sessionId })
  if (path === '/api/auth/logout' && req.method === 'POST') { auth.revoked = true; return json(res, 200, { ok: true }) }
  if (path === '/api/auth/change-password' && req.method === 'POST') {
    if (!body?.currentPassword) return json(res, 400, { error: '请输入当前登录密码' })
    if (String(body?.newPassword || '').length < 6) return json(res, 400, { error: '新密码至少需要 6 位' })
    if (body.currentPassword === body.newPassword) return json(res, 400, { error: '新密码不能与当前密码相同' })
    if (user.password !== body.currentPassword) return json(res, 400, { error: '当前登录密码不正确' })
    user.password = body.newPassword
    let revokedOtherSessions = 0
    for (const session of sessions.values()) {
      if (session.username === auth.username && session.sessionId !== auth.sessionId && !session.revoked) {
        session.revoked = true
        revokedOtherSessions += 1
      }
    }
    return json(res, 200, { ok: true, revokedOtherSessions })
  }
  if (path === '/api/tools/exchange-rate' && req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost')
    const base = url.searchParams.get('base') || 'CNY'
    const quote = url.searchParams.get('quote') || 'USD'
    return json(res, 200, { base, quote, rate: base === quote ? 1 : 0.1387, date: '2026-08-20', source: 'Browser QA' })
  }

  if (path === '/api/admin/users' && req.method === 'GET' && auth.role === 'admin') {
    return json(res, 200, [...users.values()].map(({ password, ...item }) => ({
      ...item,
      onlineSessions: [...sessions.values()].filter(s => s.username === item.username && !s.revoked).length
    })))
  }
  if (path === '/api/admin/users' && req.method === 'POST' && auth.role === 'admin') {
    if (users.has(body.username)) return json(res, 409, { error: '用户名已存在' })
    const created = { username: body.username, displayName: body.displayName || body.username, password: body.password, role: body.role || 'user', active: true, createdAt: new Date().toISOString() }
    users.set(created.username, created)
    return json(res, 201, { ...created, password: undefined, onlineSessions: 0 })
  }
  const userMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/)
  if (userMatch && req.method === 'PATCH' && auth.role === 'admin') {
    const target = users.get(decodeURIComponent(userMatch[1]))
    if (!target) return json(res, 404, { error: '用户不存在' })
    Object.assign(target, body)
    if (body.active === false) for (const s of sessions.values()) if (s.username === target.username) s.revoked = true
    return json(res, 200, { ok: true })
  }
  const resetMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/)
  if (resetMatch && req.method === 'POST' && auth.role === 'admin') {
    const target = users.get(decodeURIComponent(resetMatch[1]))
    if (!target) return json(res, 404, { error: '用户不存在' })
    target.password = body.password
    return json(res, 200, { ok: true })
  }
  if (path === '/api/admin/sessions' && req.method === 'GET' && auth.role === 'admin') {
    return json(res, 200, [...sessions.values()].filter(s => !s.revoked).map(({ token, ...s }) => s))
  }
  const revokeMatch = path.match(/^\/api\/admin\/sessions\/([^/]+)\/revoke$/)
  if (revokeMatch && req.method === 'POST' && auth.role === 'admin') {
    const target = [...sessions.values()].find(s => s.sessionId === decodeURIComponent(revokeMatch[1]))
    if (!target) return json(res, 404, { error: '会话不存在或已下线' })
    target.revoked = true
    return json(res, 200, { ok: true })
  }

  const ownerTables = tablesFor(auth.username)
  const match = path.match(/^\/api\/data\/([^/]+)(?:\/([^/]+))?$/)
  if (match && ownerTables.has(match[1])) {
    const table = ownerTables.get(match[1])
    const key = match[2] && decodeURIComponent(match[2])
    if (req.method === 'GET' && !key) return json(res, 200, [...table.values()])
    if (req.method === 'GET') return table.has(key) ? json(res, 200, table.get(key)) : json(res, 404, { error: '记录不存在' })
    if (req.method === 'PUT') { table.set(String(body[keyFields[match[1]]]), body); return json(res, 200, body) }
    if (req.method === 'DELETE') { key ? table.delete(key) : table.clear(); return json(res, 204) }
  }
  if (path.endsWith('/bulk') && req.method === 'POST') {
    const name = path.split('/')[3]
    for (const row of body || []) ownerTables.get(name)?.set(String(row[keyFields[name]]), row)
    return json(res, 200, { count: body?.length || 0 })
  }
  return json(res, 200, { ok: true })
}).listen(3000, '127.0.0.1', () => console.log('Browser QA mock API listening on :3000'))
