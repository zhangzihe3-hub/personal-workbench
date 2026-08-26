import { Capacitor } from '@capacitor/core'

const TOKEN_KEY = 'pwb_server_token'
const API_BASE_KEY = 'pwb_server_api_base'
const CURRENT_USER_KEY = 'pwb_server_current_user'
const WEB_DEFAULT_API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
export const DEFAULT_API_BASE = Capacitor.isNativePlatform() ? '' : WEB_DEFAULT_API_BASE

export function normalizeApiBase(value) {
  return String(value ?? '').trim().replace(/\/$/, '')
}

export function validateApiBase(value, native = Capacitor.isNativePlatform()) {
  const base = normalizeApiBase(value)
  if (!base) throw new Error('请填写服务器 API 地址')
  if (!native) return base
  if (!/^https?:\/\//i.test(base)) {
    throw new Error('Android 请填写完整的 HTTP 或 HTTPS API 地址，例如 http://服务器IP:8080/api')
  }
  let url
  try {
    url = new URL(base)
  } catch {
    throw new Error('服务器 API 地址格式不正确')
  }
  if (!url.pathname.replace(/\/$/, '').endsWith('/api')) {
    throw new Error('服务器 API 地址应以 /api 结尾，例如 https://你的域名/api')
  }
  return base
}

export const getApiBase = () => normalizeApiBase(localStorage.getItem(API_BASE_KEY) ?? DEFAULT_API_BASE)
export function setApiBase(value) {
  const base = normalizeApiBase(value || DEFAULT_API_BASE)
  if (base === DEFAULT_API_BASE) localStorage.removeItem(API_BASE_KEY)
  else localStorage.setItem(API_BASE_KEY, base)
}

export const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null') }
  catch { return null }
}

export function setCurrentUser(user) {
  if (user) localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(CURRENT_USER_KEY)
}

export async function apiFetch(path, options = {}) {
  const apiBase = validateApiBase(getApiBase())
  const headers = new Headers(options.headers || {})
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  let response
  try {
    response = await fetch(`${apiBase}${path}`, { ...options, headers })
  } catch (cause) {
    const message = apiBase.startsWith('http://')
      ? '无法连接服务器，请确认 IP、端口和防火墙已放行；当前使用 HTTP，建议尽快配置 HTTPS'
      : '无法连接服务器，请检查 API 地址和网络连接'
    const error = new Error(message)
    error.cause = cause
    throw error
  }
  if (response.status === 401) {
    setToken('')
    setCurrentUser(null)
    window.dispatchEvent(new CustomEvent('pwb:auth-expired'))
  }

  let body = null
  if (response.status !== 204) {
    const text = await response.text()
    if (text) {
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.toLowerCase().includes('application/json')) {
        const returnedPage = text.trimStart().startsWith('<')
        const message = returnedPage
          ? 'API 地址错误：服务器返回了网页，请填写完整地址，例如 https://你的域名/api'
          : `服务器返回了无法识别的内容（${response.status}）`
        const error = new Error(message)
        error.status = response.status
        throw error
      }
      try {
        body = JSON.parse(text)
      } catch {
        const error = new Error('服务器返回的数据格式不正确，请检查 API 地址和服务器配置')
        error.status = response.status
        throw error
      }
    }
  }
  if (!response.ok) {
    const error = new Error(body?.error || `请求失败（${response.status}）`)
    error.status = response.status
    throw error
  }
  return body
}

export async function login(username, password) {
  const result = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  setToken(result.token)
  setCurrentUser({ username: result.username, displayName: result.displayName, role: result.role, sessionId: result.sessionId })
  return result
}

export async function logout() {
  try { if (getToken()) await apiFetch('/auth/logout', { method: 'POST' }) } catch { /* 本地仍需退出 */ }
  setToken('')
  setCurrentUser(null)
  window.dispatchEvent(new CustomEvent('pwb:auth-expired'))
}

export function changeLoginPassword(currentPassword, newPassword) {
  return apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword })
  })
}

export async function checkSession() {
  if (!getToken()) return null
  try {
    const user = await apiFetch('/auth/me')
    setCurrentUser(user)
    return user
  } catch { return null }
}

export const adminApi = {
  listUsers: () => apiFetch('/admin/users'),
  createUser: payload => apiFetch('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (username, payload) => apiFetch(`/admin/users/${encodeURIComponent(username)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  resetPassword: (username, password) => apiFetch(`/admin/users/${encodeURIComponent(username)}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
  listSessions: () => apiFetch('/admin/sessions'),
  revokeSession: sessionId => apiFetch(`/admin/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: 'POST' })
}
