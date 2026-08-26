import { describe, expect, it, vi } from 'vitest'
import { getExchangeRate } from '../server/exchange.js'

describe('exchange rate service', () => {
  it('returns a fixed rate for the same currency without a request', async () => {
    const fetchMock = vi.fn()
    const result = await getExchangeRate('cny', 'CNY', fetchMock)
    expect(result.rate).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates currencies and parses provider data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ date: '2026-08-20', base: 'USD', quote: 'CNY', rate: 7.1 })
    })
    await expect(getExchangeRate('ABC', 'CNY', fetchMock)).rejects.toThrow('不支持的货币代码')
    const result = await getExchangeRate('USD', 'CNY', fetchMock)
    expect(result).toMatchObject({ base: 'USD', quote: 'CNY', rate: 7.1, date: '2026-08-20' })
  })
})
