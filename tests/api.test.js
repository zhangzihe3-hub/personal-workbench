import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, normalizeApiBase, validateApiBase } from '../src/services/api.js'

afterEach(() => vi.unstubAllGlobals())

describe('API 地址校验', () => {
  it('Web 允许同域相对地址', () => {
    expect(validateApiBase('/api', false)).toBe('/api')
  })

  it('Android 拒绝相对地址', () => {
    expect(() => validateApiBase('/api', true)).toThrow('完整的 HTTP 或 HTTPS API 地址')
  })

  it('Android 要求 /api 路径', () => {
    expect(() => validateApiBase('https://workbench.example.com', true)).toThrow('以 /api 结尾')
  })

  it('接受并规范化完整 Android API 地址', () => {
    expect(validateApiBase(' https://workbench.example.com/api/ ', true))
      .toBe('https://workbench.example.com/api')
    expect(normalizeApiBase('/api/')).toBe('/api')
  })

  it('Android 兼容只有 IP 和端口的 HTTP 服务器', () => {
    expect(validateApiBase('http://1.14.124.252:8080/api', true))
      .toBe('http://1.14.124.252:8080/api')
  })

  it('把 HTML 响应转换成清晰的 API 地址错误', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key) => key === 'pwb_server_api_base' ? '/wrong-api' : null,
      removeItem: vi.fn(),
      setItem: vi.fn(),
    })
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!DOCTYPE html><title>Web</title>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })))

    await expect(apiFetch('/auth/login')).rejects.toThrow('服务器返回了网页')
  })

  it('把 HTTP 网络失败转换成可操作的中文提示', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key) => key === 'pwb_server_api_base' ? 'http://server.example:8080/api' : null,
      removeItem: vi.fn(),
      setItem: vi.fn(),
    })
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    await expect(apiFetch('/auth/login')).rejects.toThrow('请确认 IP、端口和防火墙已放行')
  })
})
