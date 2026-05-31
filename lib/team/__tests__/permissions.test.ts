import { describe, it, expect } from 'vitest'
import { canManageMember, canInvite } from '../permissions'

describe('canManageMember', () => {
  it('owner can manage admin, member, viewer', () => {
    expect(canManageMember('owner', 'admin')).toBe(true)
    expect(canManageMember('owner', 'member')).toBe(true)
    expect(canManageMember('owner', 'viewer')).toBe(true)
  })
  it('owner cannot manage owner', () => {
    expect(canManageMember('owner', 'owner')).toBe(false)
  })
  it('admin can manage member and viewer', () => {
    expect(canManageMember('admin', 'member')).toBe(true)
    expect(canManageMember('admin', 'viewer')).toBe(true)
  })
  it('admin cannot manage admin or owner', () => {
    expect(canManageMember('admin', 'admin')).toBe(false)
    expect(canManageMember('admin', 'owner')).toBe(false)
  })
  it('member and viewer cannot manage anyone', () => {
    expect(canManageMember('member', 'viewer')).toBe(false)
    expect(canManageMember('viewer', 'member')).toBe(false)
  })
})

describe('canInvite', () => {
  it('owner and admin can invite', () => {
    expect(canInvite('owner')).toBe(true)
    expect(canInvite('admin')).toBe(true)
  })
  it('member and viewer cannot invite', () => {
    expect(canInvite('member')).toBe(false)
    expect(canInvite('viewer')).toBe(false)
  })
})
