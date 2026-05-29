import { describe, it, expect } from 'vitest'
import { getWaitDuration } from '../engine'

describe('getWaitDuration', () => {
  it('converts minutes to milliseconds', () => {
    expect(getWaitDuration({ unit: 'minutes', value: 30 })).toBe(30 * 60 * 1000)
  })
  it('converts hours to milliseconds', () => {
    expect(getWaitDuration({ unit: 'hours', value: 2 })).toBe(2 * 60 * 60 * 1000)
  })
  it('converts days to milliseconds', () => {
    expect(getWaitDuration({ unit: 'days', value: 1 })).toBe(24 * 60 * 60 * 1000)
  })
  it('defaults to 1 hour for unknown unit', () => {
    expect(getWaitDuration({ unit: 'unknown', value: 5 })).toBe(60 * 60 * 1000)
  })
})
