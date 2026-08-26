import { describe, expect, it } from 'vitest'
import {
  createToken, credentialsMatch, hashPassword, validatePasswordChange, verifyPassword, verifyToken
} from '../server/auth.js'
import { config } from '../server/config.js'
import { assertTable, parseData, recordKey, TABLES } from '../server/db.js'

describe('server authentication', () => {
  it('creates and verifies an authenticated token', () => {
    const token = createToken('admin', { role: 'admin', sessionId: 'session-1' })
    expect(verifyToken(token)?.sub).toBe('admin')
    expect(verifyToken(token)?.role).toBe('admin')
    expect(verifyToken(token)?.sid).toBe('session-1')
    expect(verifyToken(`${token}broken`)).toBeNull()
  })

  it('hashes every user password with an individual salt', async () => {
    const first = await hashPassword('safe-password')
    const second = await hashPassword('safe-password')
    expect(first).not.toBe(second)
    expect(await verifyPassword('safe-password', first)).toBe(true)
    expect(await verifyPassword('wrong-password', first)).toBe(false)
  })

  it('compares configured credentials safely', () => {
    expect(credentialsMatch(config.adminUsername, config.adminPassword)).toBe(true)
    expect(credentialsMatch('admin', 'wrong')).toBe(false)
  })

  it('validates self-service password changes', () => {
    expect(validatePasswordChange('', 'new-password')).toBe('请输入当前登录密码')
    expect(validatePasswordChange('old-password', 'short')).toBe('新密码至少需要 6 位')
    expect(validatePasswordChange('same-password', 'same-password')).toBe('新密码不能与当前密码相同')
    expect(validatePasswordChange('old-password', 'new-password')).toBe('')
  })
})

describe('MySQL record helpers', () => {
  it('accepts only known logical tables', () => {
    expect(TABLES).toContain('tasks')
    expect(() => assertTable('unknown')).toThrow('不支持的数据表')
  })

  it('extracts and validates record keys', () => {
    expect(recordKey('tasks', { task_id: 't-1' })).toBe('t-1')
    expect(() => recordKey('tasks', {})).toThrow('缺少主键')
  })

  it('parses both MySQL JSON strings and objects', () => {
    expect(parseData('{"task_id":"t-1"}')).toEqual({ task_id: 't-1' })
    expect(parseData({ task_id: 't-2' })).toEqual({ task_id: 't-2' })
  })
})
