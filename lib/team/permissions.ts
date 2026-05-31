type Role = 'owner' | 'admin' | 'member' | 'viewer'
const RANK: Record<Role, number> = { owner: 4, admin: 3, member: 2, viewer: 1 }

export function canManageMember(callerRole: Role, targetRole: Role): boolean {
  if (targetRole === 'owner') return false
  if (callerRole === 'owner') return true
  if (callerRole === 'admin') return RANK[targetRole] < RANK['admin']
  return false
}

export function canInvite(callerRole: Role): boolean {
  return callerRole === 'owner' || callerRole === 'admin'
}
