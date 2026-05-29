# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Foundation sub-project — project scaffold, Supabase auth (phone/OTP + email + Google OAuth), onboarding flow, and dashboard shell with icon sidebar.

**Architecture:** Next.js 14 App Router with two route groups: `(auth)` for unauthenticated pages and `(dashboard)` for protected pages. Supabase handles all auth and PostgreSQL storage with RLS enforcing multi-tenant data isolation. Next.js middleware guards dashboard routes server-side.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, @supabase/ssr, @supabase/supabase-js, Vitest, @testing-library/react

---

## File Map

| File | Responsibility |
|---|---|
| `lib/supabase/client.ts` | Browser-side Supabase client (singleton) |
| `lib/supabase/server.ts` | Server-side Supabase client (cookie-aware) |
| `lib/utils.ts` | `slugify()` helper + `cn()` class merger |
| `middleware.ts` | Protect dashboard routes, redirect unauthenticated users |
| `supabase/migrations/001_foundation.sql` | Tables, RLS policies, auth trigger |
| `app/(auth)/login/page.tsx` | Login page wrapper |
| `app/(auth)/verify-otp/page.tsx` | OTP entry page wrapper |
| `app/(auth)/onboarding/page.tsx` | Onboarding page wrapper |
| `app/api/auth/callback/route.ts` | Exchange OAuth code for Supabase session |
| `components/auth/LoginForm.tsx` | Phone/email tab form + Google OAuth button |
| `components/auth/OtpForm.tsx` | 6-digit OTP input with resend timer |
| `components/auth/OnboardingForm.tsx` | Full name + org name form |
| `components/layout/Sidebar.tsx` | Icon sidebar, hover-expands to 220px |
| `components/layout/TopBar.tsx` | Page title + notifications + avatar |
| `app/(dashboard)/layout.tsx` | Composes Sidebar + TopBar around page slot |
| `app/(dashboard)/dashboard/page.tsx` | KPI cards + empty state |
| `app/(dashboard)/[section]/page.tsx` | Placeholder for all other nav pages |

---

## Task 1: Scaffold Project

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.env.local.example`

- [ ] **Step 1: Create the Next.js project**

Run inside `/Users/poledilip/`:
```bash
npx create-next-app@latest email-marketing-saas \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"
```
When prompted, accept all defaults.

- [ ] **Step 2: Install dependencies**

```bash
cd email-marketing-saas
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```
Choose: New York style, Zinc base color, yes to CSS variables.

Then add components used in this plan:
```bash
npx shadcn@latest add button input label tabs card dropdown-menu avatar
```

- [ ] **Step 4: Create vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 5: Create vitest setup file**

Create `vitest.setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 7: Create env example file**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 8: Copy env example to .env.local**

```bash
cp .env.local.example .env.local
```
Fill in your actual Supabase URL and anon key from your Supabase project dashboard (Settings → API).

- [ ] **Step 9: Add .env.local and .superpowers to .gitignore**

Open `.gitignore` and verify these lines are present (add if missing):
```
.env.local
.superpowers/
```

- [ ] **Step 10: Commit scaffold**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Supabase and shadcn/ui"
```

---

## Task 2: Supabase Clients + Utils

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/utils.ts`
- Create: `lib/__tests__/utils.test.ts`

- [ ] **Step 1: Write failing test for slugify**

Create `lib/__tests__/utils.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test:run lib/__tests__/utils.test.ts
```
Expected: FAIL — `slugify` is not exported from `../utils`

- [ ] **Step 3: Create lib/utils.ts**

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

Install missing dep:
```bash
npm install clsx tailwind-merge
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test:run lib/__tests__/utils.test.ts
```
Expected: PASS — 4 tests pass

- [ ] **Step 5: Create browser Supabase client**

Create `lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 6: Create server Supabase client**

Create `lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — cookie writes ignored (handled by middleware)
          }
        },
      },
    }
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/
git commit -m "feat: add Supabase clients and utils"
```

---

## Task 3: Database Schema + Trigger

**Files:**
- Create: `supabase/migrations/001_foundation.sql`

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com, create a new project. Copy the project URL and anon key into `.env.local`.

Enable Phone auth in Supabase dashboard: Authentication → Providers → Phone → Enable (requires Twilio credentials for production; test mode works without them).

Enable Google OAuth: Authentication → Providers → Google → Enable (add OAuth client ID + secret from Google Cloud Console).

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/001_foundation.sql`:
```sql
-- organizations: multi-tenant root
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  slug       text unique not null default gen_random_uuid()::text,
  logo_url   text,
  created_at timestamptz default now()
);

-- profiles: extends auth.users
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  full_name       text not null default '',
  avatar_url      text,
  role            text not null default 'owner'
                  check (role in ('owner', 'admin', 'member')),
  created_at      timestamptz default now()
);

-- invitations: team member onboarding (schema only, UI in sub-project 9)
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  email           text not null,
  role            text not null default 'member',
  token           text unique not null default gen_random_uuid()::text,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_at      timestamptz default now()
);

-- Enable RLS
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;

-- Helper function: get current user's organization_id
create or replace function public.current_org_id()
returns uuid language sql stable security definer as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

-- organizations RLS
create policy "members can read own org"
  on public.organizations for select
  using (id = public.current_org_id());

create policy "owner can update own org"
  on public.organizations for update
  using (
    id = public.current_org_id() and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner'
    )
  );

-- profiles RLS
create policy "users can read own org profiles"
  on public.profiles for select
  using (organization_id = public.current_org_id());

create policy "users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- invitations RLS
create policy "admins can insert invitations"
  on public.invitations for insert
  with check (
    organization_id = public.current_org_id() and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "anyone can read invitation by token"
  on public.invitations for select
  using (true);

-- Trigger: create stub org + profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_org_id uuid;
begin
  insert into public.organizations (id, name, slug)
  values (gen_random_uuid(), '', gen_random_uuid()::text)
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, full_name, role)
  values (new.id, new_org_id, '', 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 3: Apply the migration**

Go to your Supabase project → SQL Editor → paste the contents of `001_foundation.sql` → Run.

Verify in Table Editor that `organizations`, `profiles`, and `invitations` tables exist.

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add database schema, RLS policies, and auth trigger"
```

---

## Task 4: Middleware (Route Protection)

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create middleware**

Create `middleware.ts` at the project root:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — required by @supabase/ssr
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const protectedPrefixes = [
    '/dashboard',
    '/campaigns',
    '/automations',
    '/contacts',
    '/analytics',
    '/integrations',
    '/settings',
  ]

  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p))

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from auth pages
  const authPaths = ['/login', '/signup']
  if (user && authPaths.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify middleware compiles**

```bash
npm run build 2>&1 | head -20
```
Expected: no TypeScript errors related to middleware.ts (build may fail on missing pages — that's fine at this stage).

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add route protection middleware"
```

---

## Task 5: Login Page

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `components/auth/LoginForm.tsx`
- Create: `components/auth/__tests__/LoginForm.test.tsx`

- [ ] **Step 1: Write failing test for LoginForm**

Create `components/auth/__tests__/LoginForm.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginForm from '../LoginForm'

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}))

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('LoginForm', () => {
  it('renders phone tab by default', () => {
    render(<LoginForm />)
    expect(screen.getByPlaceholderText(/phone number/i)).toBeInTheDocument()
  })

  it('switches to email tab on click', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.click(screen.getByRole('tab', { name: /email/i }))
    expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument()
  })

  it('shows Google OAuth button', () => {
    render(<LoginForm />)
    expect(screen.getByText(/continue with google/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test:run components/auth/__tests__/LoginForm.test.tsx
```
Expected: FAIL — `LoginForm` module not found

- [ ] **Step 3: Create LoginForm component**

Create `components/auth/LoginForm.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: 'sms' },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push(`/verify-otp?phone=${encodeURIComponent(phone)}`)
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push('/dashboard')
  }

  async function handleGoogleLogin() {
    setError(null)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
      </div>

      <Tabs defaultValue="phone" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="phone" className="flex-1">📱 Phone</TabsTrigger>
          <TabsTrigger value="email" className="flex-1">✉️ Email</TabsTrigger>
        </TabsList>

        <TabsContent value="phone">
          <form onSubmit={handlePhoneSubmit} className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="Phone number (e.g. +91 98765 43210)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP'}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="email">
          <form onSubmit={handleEmailSubmit} className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs text-slate-400">
          <span className="bg-white px-2">or</span>
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={handleGoogleLogin}
        type="button"
      >
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </Button>

      <p className="text-center text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <a href="/signup" className="text-blue-600 hover:underline">Sign up</a>
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test:run components/auth/__tests__/LoginForm.test.tsx
```
Expected: PASS — 3 tests pass

- [ ] **Step 5: Create login page**

Create `app/(auth)/login/page.tsx`:
```typescript
import LoginForm from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <LoginForm />
    </main>
  )
}
```

Also create `app/(auth)/signup/page.tsx` (redirect to login — signup via same form):
```typescript
import { redirect } from 'next/navigation'

export default function SignupPage() {
  redirect('/login')
}
```

- [ ] **Step 6: Commit**

```bash
git add app/(auth)/login/ app/(auth)/signup/ components/auth/LoginForm.tsx components/auth/__tests__/
git commit -m "feat: add login page with phone/email/Google auth"
```

---

## Task 6: OTP Verification Page

**Files:**
- Create: `components/auth/OtpForm.tsx`
- Create: `components/auth/__tests__/OtpForm.test.tsx`
- Create: `app/(auth)/verify-otp/page.tsx`

- [ ] **Step 1: Write failing test**

Create `components/auth/__tests__/OtpForm.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OtpForm from '../OtpForm'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => '+919876543210' }),
}))

describe('OtpForm', () => {
  it('renders 6 OTP input boxes', () => {
    render(<OtpForm />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(6)
  })

  it('shows the phone number from search params', () => {
    render(<OtpForm />)
    expect(screen.getByText(/\+919876543210/)).toBeInTheDocument()
  })

  it('shows a resend button', () => {
    render(<OtpForm />)
    expect(screen.getByText(/resend/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test:run components/auth/__tests__/OtpForm.test.tsx
```
Expected: FAIL — `OtpForm` module not found

- [ ] **Step 3: Create OtpForm component**

Create `components/auth/OtpForm.tsx`:
```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

const OTP_LENGTH = 6
const RESEND_SECONDS = 60

export default function OtpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') ?? ''

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(RESEND_SECONDS)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const supabase = createClient()

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  async function handleVerify() {
    const otp = digits.join('')
    if (otp.length < OTP_LENGTH) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    // Check if profile is already complete (returning user)
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, organization_id')
      .eq('id', data.user?.id)
      .single()

    if (profile?.full_name) {
      router.push('/dashboard')
    } else {
      router.push('/onboarding')
    }
  }

  async function handleResend() {
    setError(null)
    await supabase.auth.signInWithOtp({ phone, options: { channel: 'sms' } })
    setCountdown(RESEND_SECONDS)
  }

  return (
    <div className="w-full max-w-sm space-y-6 text-center">
      <div>
        <div className="mx-auto mb-4 h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Enter OTP</h1>
        <p className="text-sm text-slate-500 mt-1">Sent to {phone}</p>
      </div>

      <div className="flex justify-center gap-2">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="h-12 w-10 rounded-lg border border-slate-200 text-center text-lg font-semibold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label={`OTP digit ${i + 1}`}
          />
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        onClick={handleVerify}
        className="w-full"
        disabled={loading || digits.join('').length < OTP_LENGTH}
      >
        {loading ? 'Verifying...' : 'Verify OTP'}
      </Button>

      <p className="text-sm text-slate-500">
        {countdown > 0 ? (
          <>Resend in <span className="text-blue-600">{countdown}s</span></>
        ) : (
          <button onClick={handleResend} className="text-blue-600 hover:underline">
            Resend OTP
          </button>
        )}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test:run components/auth/__tests__/OtpForm.test.tsx
```
Expected: PASS — 3 tests pass

- [ ] **Step 5: Create verify-otp page**

Create `app/(auth)/verify-otp/page.tsx`:
```typescript
import { Suspense } from 'react'
import OtpForm from '@/components/auth/OtpForm'

export default function VerifyOtpPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Suspense>
        <OtpForm />
      </Suspense>
    </main>
  )
}
```

(`Suspense` is required because `OtpForm` uses `useSearchParams()`.)

- [ ] **Step 6: Commit**

```bash
git add app/(auth)/verify-otp/ components/auth/OtpForm.tsx components/auth/__tests__/OtpForm.test.tsx
git commit -m "feat: add OTP verification page"
```

---

## Task 7: Google OAuth Callback Route

**Files:**
- Create: `app/api/auth/callback/route.ts`

- [ ] **Step 1: Create the callback route**

Create `app/api/auth/callback/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Check if profile is complete
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.user.id)
        .single()

      const destination = profile?.full_name ? '/dashboard' : '/onboarding'
      return NextResponse.redirect(`${origin}${destination}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/
git commit -m "feat: add Google OAuth callback route"
```

---

## Task 8: Onboarding Page

**Files:**
- Create: `components/auth/OnboardingForm.tsx`
- Create: `components/auth/__tests__/OnboardingForm.test.tsx`
- Create: `app/(auth)/onboarding/page.tsx`

- [ ] **Step 1: Write failing test**

Create `components/auth/__tests__/OnboardingForm.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OnboardingForm from '../OnboardingForm'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { organization_id: 'org-1' } }) }) }),
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('OnboardingForm', () => {
  it('renders full name and org name fields', () => {
    render(<OnboardingForm />)
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument()
  })

  it('renders a submit button', () => {
    render(<OnboardingForm />)
    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test:run components/auth/__tests__/OnboardingForm.test.tsx
```
Expected: FAIL — `OnboardingForm` module not found

- [ ] **Step 3: Create OnboardingForm component**

Create `components/auth/OnboardingForm.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { slugify } from '@/lib/utils'

export default function OnboardingForm() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Get the stub profile created by the DB trigger
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      setError('Profile not found. Please try signing in again.')
      setLoading(false)
      return
    }

    // Update org with real name + slug
    const { error: orgError } = await supabase
      .from('organizations')
      .update({ name: orgName, slug: slugify(orgName) })
      .eq('id', profile.organization_id)

    if (orgError) {
      setError(orgError.message)
      setLoading(false)
      return
    }

    // Update profile with real name
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id)

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Set up your workspace</h1>
        <p className="text-sm text-slate-500 mt-1">Takes 30 seconds</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Your name</Label>
          <Input
            id="fullName"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="orgName">Organization name</Label>
          <Input
            id="orgName"
            placeholder="Company / brand name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Setting up...' : 'Go to Dashboard →'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test:run components/auth/__tests__/OnboardingForm.test.tsx
```
Expected: PASS — 2 tests pass

- [ ] **Step 5: Create onboarding page**

Create `app/(auth)/onboarding/page.tsx`:
```typescript
import OnboardingForm from '@/components/auth/OnboardingForm'

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <OnboardingForm />
    </main>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add app/(auth)/onboarding/ components/auth/OnboardingForm.tsx components/auth/__tests__/OnboardingForm.test.tsx
git commit -m "feat: add onboarding page"
```

---

## Task 9: Sidebar Component

**Files:**
- Create: `components/layout/Sidebar.tsx`
- Create: `components/layout/__tests__/Sidebar.test.tsx`

- [ ] **Step 1: Write failing test**

Create `components/layout/__tests__/Sidebar.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Sidebar from '../Sidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

const mockProfile = { full_name: 'Dilip', organizations: { name: 'HiringHood' } }

describe('Sidebar', () => {
  it('renders all 7 nav items', () => {
    render(<Sidebar profile={mockProfile} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Campaigns')).toBeInTheDocument()
    expect(screen.getByText('Automations')).toBeInTheDocument()
    expect(screen.getByText('Contacts')).toBeInTheDocument()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
    expect(screen.getByText('Integrations')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows user name and org name', () => {
    render(<Sidebar profile={mockProfile} />)
    expect(screen.getByText('Dilip')).toBeInTheDocument()
    expect(screen.getByText('HiringHood')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test:run components/layout/__tests__/Sidebar.test.tsx
```
Expected: FAIL — `Sidebar` module not found

- [ ] **Step 3: Create Sidebar component**

Create `components/layout/Sidebar.tsx`:
```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Mail, Zap, Users, BarChart2,
  Plug, Settings
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Campaigns', href: '/campaigns', icon: Mail },
  { label: 'Automations', href: '/automations', icon: Zap },
  { label: 'Contacts', href: '/contacts', icon: Users },
  { label: 'Analytics', href: '/analytics', icon: BarChart2 },
]

const BOTTOM_NAV_ITEMS = [
  { label: 'Integrations', href: '/integrations', icon: Plug },
  { label: 'Settings', href: '/settings', icon: Settings },
]

type Profile = {
  full_name: string
  organizations: { name: string }
}

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()

  const NavItem = ({ item }: { item: typeof NAV_ITEMS[number] }) => {
    const isActive = pathname === item.href
    return (
      <Link
        href={item.href}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 mx-1.5 transition-colors',
          isActive
            ? 'bg-blue-700 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
        )}
        title={item.label}
      >
        <item.icon className="h-5 w-5 flex-shrink-0" />
        <span className="whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity sidebar-label">
          {item.label}
        </span>
      </Link>
    )
  }

  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside
      className="group/sidebar flex flex-col bg-slate-900 transition-all duration-200 ease-in-out w-14 hover:w-56 flex-shrink-0 h-screen sticky top-0"
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-slate-800 px-3 overflow-hidden">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600">
          <Mail className="h-4 w-4 text-white" />
        </div>
        <span className="whitespace-nowrap text-sm font-bold text-slate-100 opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
          MailFlow
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-2 space-y-0.5 overflow-hidden">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-slate-800 py-2 space-y-0.5 overflow-hidden">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}
      </div>

      {/* User profile */}
      <div className="flex items-center gap-3 border-t border-slate-800 p-3 overflow-hidden">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0 overflow-hidden opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
          <p className="truncate text-xs font-medium text-slate-100">{profile.full_name}</p>
          <p className="truncate text-xs text-slate-500">{profile.organizations.name}</p>
        </div>
      </div>
    </aside>
  )
}
```

Install lucide-react:
```bash
npm install lucide-react
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test:run components/layout/__tests__/Sidebar.test.tsx
```
Expected: PASS — 2 tests pass

- [ ] **Step 5: Commit**

```bash
git add components/layout/Sidebar.tsx components/layout/__tests__/
git commit -m "feat: add icon sidebar with hover-expand"
```

---

## Task 10: TopBar + Dashboard Layout

**Files:**
- Create: `components/layout/TopBar.tsx`
- Create: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create TopBar component**

Create `components/layout/TopBar.tsx`:
```typescript
'use client'

import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/campaigns': 'Campaigns',
  '/automations': 'Automations',
  '/contacts': 'Contacts',
  '/analytics': 'Analytics',
  '/integrations': 'Integrations',
  '/settings': 'Settings',
}

type Profile = { full_name: string }

export default function TopBar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const title = PAGE_TITLES[pathname] ?? 'Dashboard'

  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900">
          <Bell className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white focus:outline-none">
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-sm text-slate-700 font-medium">
              {profile.full_name}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut} className="text-red-600 cursor-pointer">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Create dashboard layout**

Create `app/(dashboard)/layout.tsx`:
```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, role, organizations(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // If onboarding not complete, redirect
  if (!profile.full_name) redirect('/onboarding')

  const profileData = {
    full_name: profile.full_name,
    organizations: {
      name: (profile.organizations as { name: string } | null)?.name ?? '',
    },
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar profile={profileData} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar profile={profileData} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/layout/TopBar.tsx app/(dashboard)/layout.tsx
git commit -m "feat: add TopBar and dashboard shell layout"
```

---

## Task 11: Dashboard Home Page

**Files:**
- Create: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create dashboard home page**

Create `app/(dashboard)/dashboard/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          {greeting}, {firstName} 👋
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Here&apos;s what&apos;s happening with your account
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Campaigns" value={0} sub="No campaigns yet" />
        <KpiCard label="Emails Sent" value={0} sub="This month" />
        <KpiCard label="Contacts" value={0} sub="Import to start" />
        <a
          href="/campaigns"
          className="flex flex-col justify-center rounded-xl bg-blue-600 p-5 text-white hover:bg-blue-700 transition-colors"
        >
          <p className="text-xs text-blue-200">Quick Start</p>
          <p className="mt-1 text-sm font-semibold">Create your first campaign →</p>
        </a>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
          <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Ready to send your first email?</h3>
        <p className="mt-1.5 text-xs text-slate-500">
          Import contacts or create a campaign to get started
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <a
            href="/campaigns"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Create Campaign
          </a>
          <a
            href="/contacts"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Import Contacts
          </a>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(dashboard)/dashboard/
git commit -m "feat: add dashboard home with KPI cards and empty state"
```

---

## Task 12: Placeholder Pages + Root Redirect

**Files:**
- Create: `app/(dashboard)/campaigns/page.tsx`
- Create: `app/(dashboard)/automations/page.tsx`
- Create: `app/(dashboard)/contacts/page.tsx`
- Create: `app/(dashboard)/analytics/page.tsx`
- Create: `app/(dashboard)/integrations/page.tsx`
- Create: `app/(dashboard)/settings/page.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create placeholder component**

Create `app/(dashboard)/campaigns/page.tsx`:
```typescript
export default function CampaignsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Campaigns</h2>
      <p className="mt-1.5 text-sm text-slate-500">Coming in the next sub-project</p>
    </div>
  )
}
```

- [ ] **Step 2: Create remaining placeholder pages**

Create `app/(dashboard)/automations/page.tsx`:
```typescript
export default function AutomationsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Automations</h2>
      <p className="mt-1.5 text-sm text-slate-500">Coming in the next sub-project</p>
    </div>
  )
}
```

Create `app/(dashboard)/contacts/page.tsx`:
```typescript
export default function ContactsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Contacts</h2>
      <p className="mt-1.5 text-sm text-slate-500">Coming in the next sub-project</p>
    </div>
  )
}
```

Create `app/(dashboard)/analytics/page.tsx`:
```typescript
export default function AnalyticsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 20V10M12 20V4M6 20v-6" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Analytics</h2>
      <p className="mt-1.5 text-sm text-slate-500">Coming in the next sub-project</p>
    </div>
  )
}
```

Create `app/(dashboard)/integrations/page.tsx`:
```typescript
export default function IntegrationsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656L13.07 5.07" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Integrations</h2>
      <p className="mt-1.5 text-sm text-slate-500">Coming in the next sub-project</p>
    </div>
  )
}
```

Create `app/(dashboard)/settings/page.tsx`:
```typescript
export default function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
      <p className="mt-1.5 text-sm text-slate-500">Coming in the next sub-project</p>
    </div>
  )
}
```

- [ ] **Step 3: Update root page to redirect to dashboard**

Replace contents of `app/page.tsx`:
```typescript
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/dashboard')
}
```

- [ ] **Step 4: Run all tests**

```bash
npm run test:run
```
Expected: all tests pass

- [ ] **Step 5: Final commit**

```bash
git add app/(dashboard)/ app/page.tsx
git commit -m "feat: add placeholder pages and root redirect"
```

---

## Final Verification

- [ ] **Start dev server and test the full flow manually**

```bash
npm run dev
```

Open http://localhost:3000 — should redirect to /login.

Test the following paths:
1. Phone login → enter any number → should redirect to /verify-otp
2. Google login button → should redirect to Google
3. Email/password tab → renders email + password fields
4. Navigate to /dashboard directly without session → should redirect to /login
5. After login → /onboarding should show name + org form
6. After onboarding → /dashboard shows greeting + KPI cards
7. Sidebar hover → should expand to 220px with labels visible
8. Click each nav item → should navigate to placeholder pages

- [ ] **Tag the Foundation release**

```bash
git tag v0.1.0-foundation
```
