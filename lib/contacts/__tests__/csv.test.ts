import { describe, it, expect } from 'vitest'
import { autoDetectColumns, isValidEmail, applyMapping } from '../csv'
import type { ColumnMapping, ParsedRow } from '../csv'

describe('autoDetectColumns', () => {
  it('detects email column', () => {
    const result = autoDetectColumns(['Email Address', 'Name'])
    expect(result[0].contact_field).toBe('email')
  })

  it('detects first_name column', () => {
    const result = autoDetectColumns(['First Name'])
    expect(result[0].contact_field).toBe('first_name')
  })

  it('returns null for unknown columns', () => {
    const result = autoDetectColumns(['Favourite Color'])
    expect(result[0].contact_field).toBeNull()
  })
})

describe('isValidEmail', () => {
  it('accepts valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('rejects email without @', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false)
  })
})

describe('applyMapping', () => {
  const rows: ParsedRow[] = [
    { 'Email': 'a@test.com', 'Name': 'Alice' },
    { 'Email': 'invalid', 'Name': 'Bob' },
  ]
  const mapping: ColumnMapping[] = [
    { csv_column: 'Email', contact_field: 'email' },
    { csv_column: 'Name', contact_field: null },
  ]

  it('maps valid rows', () => {
    const { valid } = applyMapping(rows, mapping)
    expect(valid).toHaveLength(1)
    expect(valid[0].email).toBe('a@test.com')
  })

  it('counts invalid emails', () => {
    const { invalidEmails } = applyMapping(rows, mapping)
    expect(invalidEmails).toBe(1)
  })
})
