import { describe, expect, it } from 'vitest'
import { convertUnit, formatConvertedNumber } from '../src/utils/unitConversion.js'

describe('unit conversion', () => {
  it('converts metric and imperial length', () => {
    expect(convertUnit(1, 'length', 'm', 'cm')).toBe(100)
    expect(convertUnit(1, 'length', 'mi', 'km')).toBeCloseTo(1.609344)
  })

  it('converts temperatures through Celsius', () => {
    expect(convertUnit(32, 'temperature', 'f', 'c')).toBeCloseTo(0)
    expect(convertUnit(100, 'temperature', 'c', 'f')).toBeCloseTo(212)
    expect(convertUnit(0, 'temperature', 'c', 'k')).toBeCloseTo(273.15)
  })

  it('converts binary storage units and formats results', () => {
    expect(convertUnit(1, 'data', 'gb', 'mb')).toBe(1024)
    expect(formatConvertedNumber(1609.344)).toBe('1,609.344')
  })
})
