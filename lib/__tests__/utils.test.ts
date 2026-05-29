import { describe, it, expect } from 'vitest'
import { slugify } from '../utils'

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('HiringHood Inc')).toBe('hiringhood-inc')
  })

  it('removes special characters', () => {
    expect(slugify('Acme & Co.')).toBe('acme-co')
  })

  it('collapses multiple spaces/hyphens', () => {
    expect(slugify('My   Company')).toBe('my-company')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  TrimMe  ')).toBe('trimme')
  })
})
