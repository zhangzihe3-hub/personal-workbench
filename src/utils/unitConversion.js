export const UNIT_CATEGORIES = [
  {
    key: 'length', label: '长度', units: [
      { key: 'mm', label: '毫米', factor: 0.001 },
      { key: 'cm', label: '厘米', factor: 0.01 },
      { key: 'm', label: '米', factor: 1 },
      { key: 'km', label: '千米', factor: 1000 },
      { key: 'in', label: '英寸', factor: 0.0254 },
      { key: 'ft', label: '英尺', factor: 0.3048 },
      { key: 'yd', label: '码', factor: 0.9144 },
      { key: 'mi', label: '英里', factor: 1609.344 }
    ]
  },
  {
    key: 'mass', label: '重量', units: [
      { key: 'mg', label: '毫克', factor: 0.000001 },
      { key: 'g', label: '克', factor: 0.001 },
      { key: 'kg', label: '千克', factor: 1 },
      { key: 't', label: '吨', factor: 1000 },
      { key: 'oz', label: '盎司', factor: 0.028349523125 },
      { key: 'lb', label: '磅', factor: 0.45359237 }
    ]
  },
  {
    key: 'area', label: '面积', units: [
      { key: 'cm2', label: '平方厘米', factor: 0.0001 },
      { key: 'm2', label: '平方米', factor: 1 },
      { key: 'km2', label: '平方千米', factor: 1000000 },
      { key: 'ha', label: '公顷', factor: 10000 },
      { key: 'acre', label: '英亩', factor: 4046.8564224 },
      { key: 'ft2', label: '平方英尺', factor: 0.09290304 }
    ]
  },
  {
    key: 'volume', label: '体积', units: [
      { key: 'ml', label: '毫升', factor: 0.001 },
      { key: 'l', label: '升', factor: 1 },
      { key: 'm3', label: '立方米', factor: 1000 },
      { key: 'tsp', label: '茶匙', factor: 0.00492892159375 },
      { key: 'tbsp', label: '汤匙', factor: 0.01478676478125 },
      { key: 'cup', label: '美制杯', factor: 0.2365882365 },
      { key: 'gal', label: '美制加仑', factor: 3.785411784 }
    ]
  },
  {
    key: 'speed', label: '速度', units: [
      { key: 'mps', label: '米/秒', factor: 1 },
      { key: 'kmh', label: '千米/时', factor: 1 / 3.6 },
      { key: 'mph', label: '英里/时', factor: 0.44704 },
      { key: 'knot', label: '节', factor: 0.5144444444 }
    ]
  },
  {
    key: 'data', label: '数据存储', units: [
      { key: 'b', label: '字节 B', factor: 1 },
      { key: 'kb', label: 'KB', factor: 1024 },
      { key: 'mb', label: 'MB', factor: 1024 ** 2 },
      { key: 'gb', label: 'GB', factor: 1024 ** 3 },
      { key: 'tb', label: 'TB', factor: 1024 ** 4 }
    ]
  },
  {
    key: 'temperature', label: '温度', units: [
      { key: 'c', label: '摄氏度 °C' },
      { key: 'f', label: '华氏度 °F' },
      { key: 'k', label: '开尔文 K' }
    ]
  }
]

function toCelsius(value, unit) {
  if (unit === 'c') return value
  if (unit === 'f') return (value - 32) * 5 / 9
  if (unit === 'k') return value - 273.15
  throw new Error('不支持的温度单位')
}

function fromCelsius(value, unit) {
  if (unit === 'c') return value
  if (unit === 'f') return value * 9 / 5 + 32
  if (unit === 'k') return value + 273.15
  throw new Error('不支持的温度单位')
}

export function convertUnit(value, categoryKey, fromKey, toKey) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return null
  const category = UNIT_CATEGORIES.find(item => item.key === categoryKey)
  if (!category) throw new Error('不支持的换算类别')
  if (categoryKey === 'temperature') return fromCelsius(toCelsius(numericValue, fromKey), toKey)
  const from = category.units.find(unit => unit.key === fromKey)
  const to = category.units.find(unit => unit.key === toKey)
  if (!from || !to) throw new Error('不支持的换算单位')
  return numericValue * from.factor / to.factor
}

export function formatConvertedNumber(value) {
  if (!Number.isFinite(value)) return '—'
  const absolute = Math.abs(value)
  if ((absolute > 0 && absolute < 0.000001) || absolute >= 1e12) return value.toExponential(6)
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(value)
}

