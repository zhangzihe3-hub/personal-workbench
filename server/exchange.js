const RATE_TTL_MS = 4 * 60 * 60 * 1000
const rateCache = new Map()

export const SUPPORTED_CURRENCIES = [
  'CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'AUD', 'CAD', 'CHF',
  'SGD', 'KRW', 'THB', 'MYR', 'INR', 'NZD'
]

export async function getExchangeRate(baseInput, quoteInput, fetchImpl = fetch) {
  const base = String(baseInput || '').toUpperCase()
  const quote = String(quoteInput || '').toUpperCase()
  if (!SUPPORTED_CURRENCIES.includes(base) || !SUPPORTED_CURRENCIES.includes(quote)) {
    const error = new Error('不支持的货币代码')
    error.status = 400
    throw error
  }
  if (base === quote) {
    return { base, quote, rate: 1, date: new Date().toISOString().slice(0, 10), source: '固定汇率' }
  }

  const key = `${base}:${quote}`
  const cached = rateCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const response = await fetchImpl(`https://api.frankfurter.dev/v2/rate/${base}/${quote}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'personal-workbench/1.5' },
    signal: AbortSignal.timeout(8000)
  })
  if (!response.ok) throw new Error(`汇率服务返回 ${response.status}`)
  const body = await response.json()
  const rate = Number(body?.rate)
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('汇率服务返回了无效数据')

  const value = { base, quote, rate, date: body.date, source: 'Frankfurter 参考汇率' }
  rateCache.set(key, { value, expiresAt: Date.now() + RATE_TTL_MS })
  return value
}

