# Team & Permissions (Sub-project 8) — Design Spec

**Date:** 2026-05-29
**Sub-project:** 8 of 9
**Scope:** 4-role team system (Owner/Admin/Member/Viewer), invite by email, role management UI at /settings/team, middleware-enforced permissions.

---

## Roles & Permissions Matrix

| Feature | Owner | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| View campaigns | ✓ | ✓ | ✓ | ✓ |
| Create/edit campaigns | ✓ | ✓ | ✓ | — |
| Send campaigns | ✓ | ✓ | ✓ | — |
| Manage contacts | ✓ | ✓ | ✓ | — |
| Build automations | ✓ | ✓ | ✓ | — |
| Build landing pages | ✓ | ✓ | ✓ | — |
| View analytics | ✓ | ✓ | ✓ | ✓ |
| Manage integrations | ✓ | ✓ | — | — |
| Invite members | ✓ | ✓ | — | — |
| Remove members | ✓ | — | — | — |
| Change member roles | ✓ | ✓ (non-owner) | — | — |
| Delete org | ✓ | — | — | — |

**Viewer-blocked routes:** `/campaigns/new`, `/campaigns/[id]/edit`, `/contacts` (write actions), `/automations/new`, `/automations/[id]/edit`, `/landing-pages/[id]/edit`

---

## Database Changes

The `profiles` table already has `role text check (role in ('owner','admin','member'))` from Foundation. One migration needed:

```sql
-- Migration: 008_team.sql
-- Add viewer role to existing check constraint
alter table public.profiles
  drop constraint profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner','admin','member','viewer'));
```

The `invitations` table already exists from Foundation with `id, organization_id, email, role, token, expires_at, accepted_at`. No changes needed.

---

## File Structure

```
app/(dashboard)/settings/
├── page.tsx                        # Redirect → /settings/team
└── team/
    ├── page.tsx                    # Team members list (Server Component)
    └── TeamPageClient.tsx          # Client: role dropdowns, invite modal, remove

components/settings/
├── TeamMembersList.tsx             # Table with role selects + remove buttons
└── InviteModal.tsx                 # Email + role picker + send invite

lib/team/
├── actions.ts                      # inviteMember, updateMemberRole, removeMember, acceptInvitation
└── queries.ts                      # getTeamMembers, getPendingInvitations

app/invite/
└── [token]/
    └── page.tsx                    # Public: accept invitation → join org
```

**Middleware update:** Extend `middleware.ts` to check role for write-protected routes.

---

## Page Architecture

### `/settings/team`

Server Component fetches team members + pending invitations, passes to `TeamPageClient`.

**Members table columns:** Avatar + Name + Email, Role (dropdown for non-owners, locked for owner), Joined date, Remove button (owner only for admins; anyone can be removed by owner; admin can remove members/viewers).

**Pending invitations section:** Email, Role, Expiry countdown, Revoke button.

**"+ Invite Member" button** → opens `InviteModal`.

### InviteModal

- Email field (required)
- Role picker — radio cards showing Admin / Member / Viewer with descriptions:
  - **Admin:** Can manage everything except team ownership
  - **Member:** Can create and edit content, cannot manage team
  - **Viewer:** Read-only access to campaigns and analytics
- "Send Invitation" button → calls `inviteMember` server action

### `lib/team/actions.ts`

**`inviteMember(email, role)`:**
1. Get org_id from current user profile
2. Check caller is owner or admin (throw if not)
3. Check no existing active member with that email
4. Create `invitations` row with `token = gen_random_uuid()`, `expires_at = now() + 7 days`
5. Send invitation email via Brevo: subject "You've been invited to join [OrgName]", body includes link `https://app.com/invite/[token]`
6. `revalidatePath('/settings/team')`

**`updateMemberRole(profileId, newRole)`:**
1. Verify caller is owner (for any role change) or admin (for member/viewer only)
2. Cannot change owner's role
3. `supabase.from('profiles').update({ role: newRole }).eq('id', profileId)`
4. `revalidatePath('/settings/team')`

**`removeMember(profileId)`:**
1. Verify caller has permission (owner can remove anyone; admin can remove members/viewers)
2. Cannot remove owner
3. Delete profile row (cascades from auth.users — soft approach: set `organization_id = null` instead of delete, so user data is preserved)
4. `revalidatePath('/settings/team')`

**`acceptInvitation(token)`:**
1. Fetch invitation by token, verify not expired, not already accepted
2. Get current user (must be logged in)
3. Update existing profile: set `organization_id` to invitation's org, `role` to invitation's role
4. Mark invitation `accepted_at = now()`
5. Redirect to `/dashboard`

### Accept Invitation Page (`/invite/[token]`)

Public page (no auth gate). If user not logged in → redirect to `/login?redirect=/invite/[token]`. If logged in → show "Join [OrgName] as [Role]?" confirmation → button calls `acceptInvitation(token)`.

### Middleware Permission Enforcement

In `middleware.ts`, after the existing auth check, add role-based blocking:

```typescript
// Viewer-blocked write routes
const viewerBlockedPrefixes = [
  '/campaigns/new', '/automations/new', '/landing-pages/new',
  '/contacts', '/automations/',  // [id]/edit handled within
]

if (user && isProtected) {
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role === 'viewer') {
    const isBlocked = viewerBlockedPrefixes.some(p => pathname.startsWith(p))
      || pathname.match(/\/(campaigns|automations|landing-pages)\/[^\/]+\/edit$/)
    if (isBlocked) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }
}
```

---

## Settings Navigation

The existing `/settings` placeholder page redirects to `/settings/team`. Future settings tabs (Profile, Notifications, Integrations) will be added as sub-routes.

---

## What Is Explicitly Out of Scope

- Activity log / audit trail
- Approval workflows (campaign requires admin approval before send)
- SSO / SAML
- Per-list or per-campaign access restrictions
- Custom roles beyond the 4 preset roles
