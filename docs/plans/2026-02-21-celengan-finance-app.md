# Celengan Personal Finance App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a "Balance-First" personal finance web app where a developer inputs monthly account balances and the system calculates net worth, inferred expenses, rebalancing suggestions, and tracks a marriage fund goal.

**Architecture:** Next.js 14 App Router with a sidebar-nav multi-page layout. Server Components fetch data; Server Actions handle writes. All financial logic lives in pure functions in `lib/calculations.ts`. Supabase handles auth (email+password) and the database (with RLS).

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS (dark-only), Supabase JS v2 + SSR, shadcn/ui, Recharts, lucide-react, date-fns.

---

## Prerequisites (Manual Steps Before Coding)

These require a browser — do them before running any code:

1. Create a Supabase project at https://supabase.com → copy Project URL and anon key.
2. In Supabase dashboard → SQL Editor → run `supabase/migrations/001_init.sql` (created in Task 2).
3. In Supabase dashboard → Authentication → Email → ensure "Enable Email Signup" is ON.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `.env.local`, `app/globals.css`, `app/layout.tsx`

**Step 1: Scaffold Next.js app**

Run in `c:/Users/PC/bot claude/celengan/`:
```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias="@/*" --no-git
```
Accept all defaults when prompted.

**Step 2: Install dependencies**
```bash
npm install @supabase/supabase-js @supabase/ssr recharts date-fns lucide-react
npm install -D @types/node
```

**Step 3: Install shadcn/ui**
```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label progress dialog table badge separator
```
When asked about style: select "Default". Base color: "Slate". CSS variables: Yes.

**Step 4: Create `.env.local`**

Create `c:/Users/PC/bot claude/celengan/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```
(Replace with real values after creating Supabase project.)

**Step 5: Configure dark mode in `tailwind.config.ts`**

In `tailwind.config.ts`, ensure:
```ts
const config: Config = {
  darkMode: 'class',
  // ... rest of config
}
```

**Step 6: Update root layout for dark mode**

In `app/layout.tsx`, add `className="dark"` to `<html>`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        {children}
      </body>
    </html>
  )
}
```

**Step 7: Verify scaffold compiles**
```bash
npm run build
```
Expected: Build succeeds (or only minor shadcn warnings).

**Step 8: Commit**
```bash
git init && git add -A && git commit -m "feat: scaffold Next.js app with Tailwind, shadcn/ui, Supabase deps"
```

---

### Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/001_init.sql`

**Step 1: Create migration file**

Create `supabase/migrations/001_init.sql`:
```sql
-- Settings (1 row per user)
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  monthly_income bigint not null default 20000000,
  goal_target bigint not null default 100000000,
  goal_target_date date not null default '2027-11-01',
  created_at timestamptz default now()
);
alter table public.settings enable row level security;
create policy "Users own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Accounts
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  type text check (type in ('cash', 'investment')) not null,
  category text check (category in ('core', 'satellite')) not null,
  balance bigint not null default 0,
  updated_at timestamptz default now()
);
alter table public.accounts enable row level security;
create policy "Users own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Balance history snapshots
create table if not exists public.balance_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade not null,
  balance_at_time bigint not null,
  recorded_at timestamptz default now()
);
alter table public.balance_history enable row level security;
create policy "Users own balance_history" on public.balance_history
  for all using (
    exists (
      select 1 from public.accounts
      where accounts.id = balance_history.account_id
        and accounts.user_id = auth.uid()
    )
  );

-- Transactions (optional expense detailing)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  description text not null,
  amount bigint not null,
  category text,
  date date not null default current_date
);
alter table public.transactions enable row level security;
create policy "Users own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Step 2: Run migration in Supabase**

Go to Supabase Dashboard → SQL Editor → paste the entire file content → Run.
Expected: "Success. No rows returned."

**Step 3: Commit**
```bash
git add supabase/migrations/001_init.sql
git commit -m "feat: add database migration for accounts, balance_history, transactions, settings"
```

---

### Task 3: Supabase Client Files

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `middleware.ts`

**Step 1: Create browser client** (`lib/supabase/client.ts`)
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 2: Create server client** (`lib/supabase/server.ts`)
```ts
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
          } catch {}
        },
      },
    }
  )
}
```

**Step 3: Create middleware** (`middleware.ts` at project root)
```ts
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')
  const isAppRoute = !isAuthRoute && request.nextUrl.pathname !== '/'

  if (!user && isAppRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

**Step 4: Update root redirect** (`app/page.tsx`)

Replace content of `app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
```

**Step 5: Verify types compile**
```bash
npx tsc --noEmit
```
Expected: No errors (or only `any` warnings from generated shadcn files).

**Step 6: Commit**
```bash
git add lib/ middleware.ts app/page.tsx
git commit -m "feat: add Supabase client/server helpers and auth middleware"
```

---

### Task 4: Financial Calculations (Pure Functions)

**Files:**
- Create: `lib/calculations.ts`

No tests framework is set up yet — these are pure functions, so write them with clear types.

**Step 1: Create `lib/calculations.ts`**
```ts
export type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  category: 'core' | 'satellite'
  balance: number
}

export function calcNetWorth(accounts: Account[]): number {
  return accounts.reduce((sum, a) => sum + a.balance, 0)
}

export function calcUnaccountedSpending(
  currentTotal: number,
  prevTotal: number,
  monthlyIncome: number,
  transactionTotal: number
): number {
  const expected = prevTotal + monthlyIncome
  const delta = expected - currentTotal
  return Math.max(0, delta - transactionTotal)
}

export function calcRebalancingSuggestion(accounts: Account[]): {
  satellitePct: number
  corePct: number
  suggestion: 'buy_core' | 'accumulate_satellite' | 'balanced'
  message: string
} {
  const investmentAccounts = accounts.filter(a => a.type === 'investment')
  const total = investmentAccounts.reduce((sum, a) => sum + a.balance, 0)

  if (total === 0) {
    return { satellitePct: 0, corePct: 0, suggestion: 'balanced', message: 'No investment accounts yet.' }
  }

  const satellite = investmentAccounts
    .filter(a => a.category === 'satellite')
    .reduce((sum, a) => sum + a.balance, 0)
  const core = total - satellite

  const satellitePct = satellite / total
  const corePct = core / total

  if (satellitePct > 0.2) {
    return {
      satellitePct,
      corePct,
      suggestion: 'buy_core',
      message: `Satellite is ${(satellitePct * 100).toFixed(1)}% of portfolio. Consider buying more Core (Gold) to rebalance toward 80/20.`,
    }
  }

  if (satellitePct < 0.2) {
    return {
      satellitePct,
      corePct,
      suggestion: 'accumulate_satellite',
      message: `Satellite is ${(satellitePct * 100).toFixed(1)}% of portfolio. Consider accumulating more Satellite (Crypto/Stocks) to reach 20%.`,
    }
  }

  return {
    satellitePct,
    corePct,
    suggestion: 'balanced',
    message: 'Portfolio is balanced at 80% Core / 20% Satellite.',
  }
}

export function calcGoalProgress(
  netWorth: number,
  target: number,
  targetDate: Date,
  today: Date = new Date()
): {
  progressPct: number
  monthsRemaining: number
  monthlyNeeded: number
} {
  const progressPct = Math.min(100, (netWorth / target) * 100)

  const months =
    (targetDate.getFullYear() - today.getFullYear()) * 12 +
    (targetDate.getMonth() - today.getMonth())
  const monthsRemaining = Math.max(0, months)

  const remaining = Math.max(0, target - netWorth)
  const monthlyNeeded = monthsRemaining > 0 ? remaining / monthsRemaining : remaining

  return { progressPct, monthsRemaining, monthlyNeeded }
}

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
```

**Step 2: Verify types**
```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 3: Commit**
```bash
git add lib/calculations.ts
git commit -m "feat: add pure financial calculation functions"
```

---

### Task 5: Auth Pages

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`

**Step 1: Create auth layout** (`app/(auth)/layout.tsx`)
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {children}
    </div>
  )
}
```

**Step 2: Create login page** (`app/(auth)/login/page.tsx`)
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PiggyBank } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setError('Check your email to confirm your account, then sign in.')
        setMode('signin')
      }
    }

    setLoading(false)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <PiggyBank className="h-10 w-10 text-emerald-500" />
        </div>
        <CardTitle className="text-2xl">Celengan</CardTitle>
        <CardDescription>
          {mode === 'signin' ? 'Sign in to your finance tracker' : 'Create your account'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Loading...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
              className="text-emerald-400 hover:underline"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
```

**Step 3: Verify build**
```bash
npm run build
```
Expected: Build succeeds.

**Step 4: Commit**
```bash
git add app/\(auth\)/
git commit -m "feat: add login/signup page with email+password auth"
```

---

### Task 6: App Layout with Sidebar

**Files:**
- Create: `components/Sidebar.tsx`
- Create: `app/(app)/layout.tsx`

**Step 1: Create Sidebar component** (`components/Sidebar.tsx`)
```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Wallet, Receipt, Settings, LogOut, PiggyBank } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 min-h-screen bg-card border-r border-border p-4">
        <div className="flex items-center gap-2 mb-8">
          <PiggyBank className="h-6 w-6 text-emerald-500" />
          <span className="font-bold text-lg">Celengan</span>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                pathname === href
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-xs text-muted-foreground truncate px-3">{userEmail}</p>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around p-2 z-50">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-1 rounded-md text-xs transition-colors',
              pathname === href ? 'text-emerald-400' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}
```

**Step 2: Create app layout** (`app/(app)/layout.tsx`)
```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar userEmail={user.email ?? ''} />
      <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8">
        {children}
      </main>
    </div>
  )
}
```

**Step 3: Verify build**
```bash
npm run build
```
Expected: Build succeeds.

**Step 4: Commit**
```bash
git add components/Sidebar.tsx app/\(app\)/layout.tsx
git commit -m "feat: add sidebar navigation and authenticated app layout"
```

---

### Task 7: Server Actions

**Files:**
- Create: `app/actions/accounts.ts`
- Create: `app/actions/transactions.ts`
- Create: `app/actions/settings.ts`

**Step 1: Create accounts actions** (`app/actions/accounts.ts`)
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateBalance(accountId: string, newBalance: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error: updateError } = await supabase
    .from('accounts')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (updateError) throw updateError

  const { error: historyError } = await supabase
    .from('balance_history')
    .insert({ account_id: accountId, balance_at_time: newBalance })

  if (historyError) throw historyError

  revalidatePath('/dashboard')
  revalidatePath('/accounts')
}

export async function createAccount(data: {
  name: string
  type: 'cash' | 'investment'
  category: 'core' | 'satellite'
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('accounts')
    .insert({ ...data, user_id: user.id, balance: 0 })

  if (error) throw error

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
}

export async function deleteAccount(accountId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (error) throw error

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
}
```

**Step 2: Create transactions actions** (`app/actions/transactions.ts`)
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createTransaction(data: {
  description: string
  amount: number
  category?: string
  date: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('transactions')
    .insert({ ...data, user_id: user.id })

  if (error) throw error

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
}

export async function deleteTransaction(transactionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', user.id)

  if (error) throw error

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
}
```

**Step 3: Create settings actions** (`app/actions/settings.ts`)
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function upsertSettings(data: {
  monthly_income: number
  goal_target: number
  goal_target_date: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('settings')
    .upsert({ ...data, user_id: user.id }, { onConflict: 'user_id' })

  if (error) throw error

  revalidatePath('/dashboard')
  revalidatePath('/settings')
}
```

**Step 4: Verify types compile**
```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 5: Commit**
```bash
git add app/actions/
git commit -m "feat: add Server Actions for accounts, transactions, and settings"
```

---

### Task 8: Reusable Widget Components

**Files:**
- Create: `components/charts/NetWorthChart.tsx`
- Create: `components/RebalancingSuggester.tsx`
- Create: `components/MarriageFundGoal.tsx`
- Create: `components/ExpenseDelta.tsx`
- Create: `components/ExportCSV.tsx`

**Step 1: Create Net Worth Chart** (`components/charts/NetWorthChart.tsx`)
```tsx
'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatIDR } from '@/lib/calculations'

type DataPoint = { month: string; netWorth: number }

export function NetWorthChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        No history yet. Update your balances to start tracking.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <YAxis
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickFormatter={v => `${(v / 1_000_000).toFixed(0)}M`}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(value: number) => [formatIDR(value), 'Net Worth']}
        />
        <Line
          type="monotone"
          dataKey="netWorth"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ fill: '#10b981', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

**Step 2: Create Rebalancing Suggester** (`components/RebalancingSuggester.tsx`)
```tsx
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, CheckCircle } from 'lucide-react'
import type { Account } from '@/lib/calculations'
import { calcRebalancingSuggestion } from '@/lib/calculations'

export function RebalancingSuggester({ accounts }: { accounts: Account[] }) {
  const { satellitePct, corePct, suggestion, message } = calcRebalancingSuggestion(accounts)

  const icon = suggestion === 'buy_core'
    ? <TrendingDown className="h-4 w-4" />
    : suggestion === 'accumulate_satellite'
    ? <TrendingUp className="h-4 w-4" />
    : <CheckCircle className="h-4 w-4" />

  const variant = suggestion === 'balanced' ? 'default' : 'secondary'

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 bg-muted rounded-md p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Core</p>
          <p className="font-bold text-emerald-400">{(corePct * 100).toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">target 80%</p>
        </div>
        <div className="flex-1 bg-muted rounded-md p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Satellite</p>
          <p className="font-bold text-amber-400">{(satellitePct * 100).toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">target 20%</p>
        </div>
      </div>
      <div className="flex items-start gap-2 p-3 rounded-md bg-muted">
        <Badge variant={variant} className="flex items-center gap-1 shrink-0 mt-0.5">
          {icon}
          {suggestion === 'buy_core' ? 'Buy Core' : suggestion === 'accumulate_satellite' ? 'Accumulate Satellite' : 'Balanced'}
        </Badge>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
```

**Step 3: Create Marriage Fund Goal** (`components/MarriageFundGoal.tsx`)
```tsx
import { Progress } from '@/components/ui/progress'
import { Heart } from 'lucide-react'
import { calcGoalProgress, formatIDR } from '@/lib/calculations'

type Props = {
  netWorth: number
  goalTarget: number
  goalTargetDate: string
}

export function MarriageFundGoal({ netWorth, goalTarget, goalTargetDate }: Props) {
  const { progressPct, monthsRemaining, monthlyNeeded } = calcGoalProgress(
    netWorth,
    goalTarget,
    new Date(goalTargetDate)
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-rose-400" />
          <span className="text-muted-foreground">Marriage Fund</span>
        </div>
        <span className="font-medium">{progressPct.toFixed(1)}%</span>
      </div>
      <Progress value={progressPct} className="h-3" />
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-muted rounded-md p-2">
          <p className="text-xs text-muted-foreground">Target</p>
          <p className="font-medium">{formatIDR(goalTarget)}</p>
        </div>
        <div className="bg-muted rounded-md p-2">
          <p className="text-xs text-muted-foreground">Current</p>
          <p className="font-medium">{formatIDR(netWorth)}</p>
        </div>
        <div className="bg-muted rounded-md p-2">
          <p className="text-xs text-muted-foreground">Months Left</p>
          <p className="font-medium">{monthsRemaining} months</p>
        </div>
        <div className="bg-muted rounded-md p-2">
          <p className="text-xs text-muted-foreground">Need/Month</p>
          <p className="font-medium">{formatIDR(monthlyNeeded)}</p>
        </div>
      </div>
    </div>
  )
}
```

**Step 4: Create Expense Delta** (`components/ExpenseDelta.tsx`)
```tsx
import { formatIDR } from '@/lib/calculations'
import { AlertTriangle, CheckCircle } from 'lucide-react'

type Props = {
  unaccountedSpending: number
  transactionTotal: number
  totalDelta: number
}

export function ExpenseDelta({ unaccountedSpending, transactionTotal, totalDelta }: Props) {
  const isHealthy = unaccountedSpending <= 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">Total Spending</p>
          <p className="font-bold text-red-400">{formatIDR(totalDelta)}</p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">Accounted</p>
          <p className="font-bold text-emerald-400">{formatIDR(transactionTotal)}</p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">Unaccounted</p>
          <p className={`font-bold ${isHealthy ? 'text-emerald-400' : 'text-amber-400'}`}>
            {formatIDR(unaccountedSpending)}
          </p>
        </div>
      </div>
      <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${isHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
        {isHealthy
          ? <><CheckCircle className="h-4 w-4" /> All spending is accounted for.</>
          : <><AlertTriangle className="h-4 w-4" /> {formatIDR(unaccountedSpending)} in untracked spending. Add transactions to detail it.</>
        }
      </div>
    </div>
  )
}
```

**Step 5: Create Export CSV** (`components/ExportCSV.tsx`)
```tsx
'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatIDR } from '@/lib/calculations'
import type { Account } from '@/lib/calculations'

type Transaction = {
  description: string
  amount: number
  category: string | null
  date: string
}

type Props = {
  accounts: Account[]
  transactions: Transaction[]
}

export function ExportCSV({ accounts, transactions }: Props) {
  function handleExport() {
    const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })

    const rows: string[] = [
      `Celengan Financial Summary - ${month}`,
      '',
      'ACCOUNTS',
      'Name,Type,Category,Balance',
      ...accounts.map(a => `${a.name},${a.type},${a.category},${a.balance}`),
      '',
      'TRANSACTIONS',
      'Date,Description,Category,Amount',
      ...transactions.map(t => `${t.date},${t.description},${t.category ?? ''},${t.amount}`),
    ]

    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `celengan-${new Date().toISOString().slice(0, 7)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export CSV
    </Button>
  )
}
```

**Step 6: Verify types**
```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 7: Commit**
```bash
git add components/
git commit -m "feat: add NetWorthChart, RebalancingSuggester, MarriageFundGoal, ExpenseDelta, ExportCSV components"
```

---

### Task 9: Dashboard Page

**Files:**
- Create: `app/(app)/dashboard/page.tsx`

**Step 1: Create dashboard page** (`app/(app)/dashboard/page.tsx`)
```tsx
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NetWorthChart } from '@/components/charts/NetWorthChart'
import { RebalancingSuggester } from '@/components/RebalancingSuggester'
import { MarriageFundGoal } from '@/components/MarriageFundGoal'
import { ExpenseDelta } from '@/components/ExpenseDelta'
import { ExportCSV } from '@/components/ExportCSV'
import { calcNetWorth, calcUnaccountedSpending, formatIDR } from '@/lib/calculations'
import { upsertSettings } from '@/app/actions/settings'
import type { Account } from '@/lib/calculations'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Auto-create settings if not exists
  let { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', user!.id)
    .single()

  if (!settings) {
    await upsertSettings({ monthly_income: 20000000, goal_target: 100000000, goal_target_date: '2027-11-01' })
    const { data } = await supabase.from('settings').select('*').eq('user_id', user!.id).single()
    settings = data
  }

  // Fetch accounts
  const { data: accountRows } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at')

  const accounts: Account[] = (accountRows ?? []).map(a => ({
    id: a.id, name: a.name, type: a.type, category: a.category, balance: a.balance,
  }))

  const netWorth = calcNetWorth(accounts)

  // Fetch current month's transactions
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const { data: txRows } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user!.id)
    .gte('date', monthStart)
    .order('date', { ascending: false })

  const transactions = txRows ?? []
  const transactionTotal = transactions.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0)

  // Previous month balance (latest history snapshot per account before this month)
  const { data: historyRows } = await supabase
    .from('balance_history')
    .select('balance_at_time, recorded_at, account_id')
    .lt('recorded_at', monthStart)
    .order('recorded_at', { ascending: false })

  // Get latest per account from last month
  const seenAccounts = new Set<string>()
  let prevTotal = 0
  for (const row of (historyRows ?? [])) {
    if (!seenAccounts.has(row.account_id)) {
      seenAccounts.add(row.account_id)
      prevTotal += row.balance_at_time
    }
  }

  const monthlyIncome = settings?.monthly_income ?? 20000000
  const totalDelta = Math.max(0, (prevTotal + monthlyIncome) - netWorth)
  const unaccountedSpending = calcUnaccountedSpending(netWorth, prevTotal, monthlyIncome, transactionTotal)

  // Net worth chart data: aggregate balance_history by month
  const { data: allHistory } = await supabase
    .from('balance_history')
    .select('balance_at_time, recorded_at, account_id')
    .order('recorded_at', { ascending: true })

  const monthlyMap = new Map<string, number>()
  const latestPerAccountPerMonth = new Map<string, Map<string, number>>()

  for (const row of (allHistory ?? [])) {
    const month = row.recorded_at.slice(0, 7) // YYYY-MM
    if (!latestPerAccountPerMonth.has(month)) {
      latestPerAccountPerMonth.set(month, new Map())
    }
    latestPerAccountPerMonth.get(month)!.set(row.account_id, row.balance_at_time)
  }

  const chartData = Array.from(latestPerAccountPerMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, accountMap]) => ({
      month: new Date(month + '-01').toLocaleString('default', { month: 'short', year: '2-digit' }),
      netWorth: Array.from(accountMap.values()).reduce((s, v) => s + v, 0),
    }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <ExportCSV accounts={accounts} transactions={transactions.map((t: { description: string; amount: number; category: string | null; date: string }) => ({
          description: t.description, amount: t.amount, category: t.category, date: t.date
        }))} />
      </div>

      {/* Net Worth */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Net Worth</CardTitle>
          <p className="text-3xl font-bold text-emerald-400">{formatIDR(netWorth)}</p>
        </CardHeader>
        <CardContent>
          <NetWorthChart data={chartData} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rebalancing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portfolio Rebalancing</CardTitle>
          </CardHeader>
          <CardContent>
            <RebalancingSuggester accounts={accounts} />
          </CardContent>
        </Card>

        {/* Marriage Fund */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Marriage Fund Goal</CardTitle>
          </CardHeader>
          <CardContent>
            <MarriageFundGoal
              netWorth={netWorth}
              goalTarget={settings?.goal_target ?? 100000000}
              goalTargetDate={settings?.goal_target_date ?? '2027-11-01'}
            />
          </CardContent>
        </Card>
      </div>

      {/* Expense Delta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expense Delta Engine</CardTitle>
          <p className="text-xs text-muted-foreground">Income: {formatIDR(monthlyIncome)} / month</p>
        </CardHeader>
        <CardContent>
          <ExpenseDelta
            unaccountedSpending={unaccountedSpending}
            transactionTotal={transactionTotal}
            totalDelta={totalDelta}
          />
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 2: Verify build**
```bash
npm run build
```
Expected: Build succeeds.

**Step 3: Commit**
```bash
git add app/\(app\)/dashboard/
git commit -m "feat: add Dashboard page with net worth, rebalancing, goal, and expense delta"
```

---

### Task 10: Accounts Page

**Files:**
- Create: `app/(app)/accounts/page.tsx`

**Step 1: Create accounts page** (`app/(app)/accounts/page.tsx`)

This is a client-heavy page due to dialogs. Use a Server Component for data fetching + pass to a Client Component.

Create `app/(app)/accounts/AccountsClient.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { updateBalance, createAccount, deleteAccount } from '@/app/actions/accounts'
import { formatIDR } from '@/lib/calculations'
import type { Account } from '@/lib/calculations'

export function AccountsClient({ accounts }: { accounts: Account[] }) {
  const [isPending, startTransition] = useTransition()
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [newBalance, setNewBalance] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'cash' | 'investment'>('cash')
  const [newCategory, setNewCategory] = useState<'core' | 'satellite'>('core')

  function handleUpdateBalance(account: Account) {
    const balance = parseInt(newBalance.replace(/[^0-9]/g, ''), 10)
    if (isNaN(balance)) return
    startTransition(() => {
      updateBalance(account.id, balance)
      setEditAccount(null)
      setNewBalance('')
    })
  }

  function handleCreate() {
    if (!newName.trim()) return
    startTransition(() => {
      createAccount({ name: newName.trim(), type: newType, category: newCategory })
      setAddOpen(false)
      setNewName('')
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this account and all its history?')) return
    startTransition(() => deleteAccount(id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Add Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. BCA Savings" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2">
                  {(['cash', 'investment'] as const).map(t => (
                    <button key={t} onClick={() => setNewType(t)}
                      className={`flex-1 py-2 rounded-md text-sm border transition-colors ${newType === t ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-border text-muted-foreground'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <div className="flex gap-2">
                  {(['core', 'satellite'] as const).map(c => (
                    <button key={c} onClick={() => setNewCategory(c)}
                      className={`flex-1 py-2 rounded-md text-sm border transition-colors ${newCategory === c ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-border text-muted-foreground'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={isPending}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-12">No accounts yet. Add one to get started.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(account => (
          <Card key={account.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{account.name}</CardTitle>
                <button onClick={() => handleDelete(account.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-1">
                <Badge variant="outline" className="text-xs">{account.type}</Badge>
                <Badge variant="outline" className={`text-xs ${account.category === 'core' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {account.category}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold mb-3">{formatIDR(account.balance)}</p>
              <Dialog open={editAccount?.id === account.id} onOpenChange={open => { setEditAccount(open ? account : null); setNewBalance('') }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    <Pencil className="h-3 w-3 mr-2" />Update Balance
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Update {account.name}</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>New Balance (IDR)</Label>
                      <Input
                        type="number"
                        value={newBalance}
                        onChange={e => setNewBalance(e.target.value)}
                        placeholder={account.balance.toString()}
                        autoFocus
                      />
                    </div>
                    <Button onClick={() => handleUpdateBalance(account)} className="w-full" disabled={isPending}>
                      Save Balance
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

Create `app/(app)/accounts/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { AccountsClient } from './AccountsClient'
import type { Account } from '@/lib/calculations'

export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at')

  const accounts: Account[] = (data ?? []).map(a => ({
    id: a.id, name: a.name, type: a.type, category: a.category, balance: a.balance,
  }))

  return <AccountsClient accounts={accounts} />
}
```

**Step 2: Verify build**
```bash
npm run build
```
Expected: Build succeeds.

**Step 3: Commit**
```bash
git add app/\(app\)/accounts/
git commit -m "feat: add Accounts page with dynamic balance updates and account management"
```

---

### Task 11: Transactions Page

**Files:**
- Create: `app/(app)/transactions/TransactionsClient.tsx`
- Create: `app/(app)/transactions/page.tsx`

**Step 1: Create client component** (`app/(app)/transactions/TransactionsClient.tsx`)
```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Trash2 } from 'lucide-react'
import { createTransaction, deleteTransaction } from '@/app/actions/transactions'
import { ExpenseDelta } from '@/components/ExpenseDelta'
import { formatIDR } from '@/lib/calculations'

type Transaction = { id: string; description: string; amount: number; category: string | null; date: string }

type Props = {
  transactions: Transaction[]
  unaccountedSpending: number
  transactionTotal: number
  totalDelta: number
}

export function TransactionsClient({ transactions, unaccountedSpending, transactionTotal, totalDelta }: Props) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  function handleCreate() {
    const amt = parseInt(amount, 10)
    if (!desc.trim() || isNaN(amt)) return
    startTransition(() => {
      createTransaction({ description: desc.trim(), amount: amt, category: category || undefined, date })
      setOpen(false)
      setDesc(''); setAmount(''); setCategory('')
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Add Transaction</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Money for Mom" />
              </div>
              <div className="space-y-2">
                <Label>Amount (IDR)</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="500000" />
              </div>
              <div className="space-y-2">
                <Label>Category (optional)</Label>
                <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Family" />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={isPending}>Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ExpenseDelta
        unaccountedSpending={unaccountedSpending}
        transactionTotal={transactionTotal}
        totalDelta={totalDelta}
      />

      {transactions.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-12">No transactions this month.</p>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground text-sm">{t.date}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{t.category ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium">{formatIDR(t.amount)}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => startTransition(() => deleteTransaction(t.id))}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Create server page** (`app/(app)/transactions/page.tsx`)
```tsx
import { createClient } from '@/lib/supabase/server'
import { TransactionsClient } from './TransactionsClient'
import { calcUnaccountedSpending } from '@/lib/calculations'

export default async function TransactionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const [{ data: txRows }, { data: accountRows }, { data: settings }, { data: historyRows }] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', user!.id).gte('date', monthStart).order('date', { ascending: false }),
    supabase.from('accounts').select('balance').eq('user_id', user!.id),
    supabase.from('settings').select('monthly_income').eq('user_id', user!.id).single(),
    supabase.from('balance_history').select('balance_at_time, account_id').lt('recorded_at', monthStart).order('recorded_at', { ascending: false }),
  ])

  const transactions = (txRows ?? []) as { id: string; description: string; amount: number; category: string | null; date: string }[]
  const currentTotal = (accountRows ?? []).reduce((s: number, a: { balance: number }) => s + a.balance, 0)
  const transactionTotal = transactions.reduce((s, t) => s + t.amount, 0)
  const monthlyIncome = settings?.monthly_income ?? 20000000

  const seenAccounts = new Set<string>()
  let prevTotal = 0
  for (const row of (historyRows ?? [])) {
    if (!seenAccounts.has(row.account_id)) {
      seenAccounts.add(row.account_id)
      prevTotal += row.balance_at_time
    }
  }

  const totalDelta = Math.max(0, (prevTotal + monthlyIncome) - currentTotal)
  const unaccountedSpending = calcUnaccountedSpending(currentTotal, prevTotal, monthlyIncome, transactionTotal)

  return (
    <TransactionsClient
      transactions={transactions}
      unaccountedSpending={unaccountedSpending}
      transactionTotal={transactionTotal}
      totalDelta={totalDelta}
    />
  )
}
```

**Step 3: Verify build**
```bash
npm run build
```
Expected: Build succeeds.

**Step 4: Commit**
```bash
git add app/\(app\)/transactions/
git commit -m "feat: add Transactions page with expense delta display"
```

---

### Task 12: Settings Page

**Files:**
- Create: `app/(app)/settings/page.tsx`

**Step 1: Create settings page** (`app/(app)/settings/page.tsx`)
```tsx
'use client'

import { useState, useTransition, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { upsertSettings } from '@/app/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatIDR } from '@/lib/calculations'

export default function SettingsPage() {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [monthlyIncome, setMonthlyIncome] = useState('20000000')
  const [goalTarget, setGoalTarget] = useState('100000000')
  const [goalDate, setGoalDate] = useState('2027-11-01')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('settings').select('*').eq('user_id', user.id).single().then(({ data }) => {
        if (data) {
          setMonthlyIncome(data.monthly_income.toString())
          setGoalTarget(data.goal_target.toString())
          setGoalDate(data.goal_target_date)
        }
      })
    })
  }, [])

  function handleSave() {
    startTransition(async () => {
      await upsertSettings({
        monthly_income: parseInt(monthlyIncome, 10),
        goal_target: parseInt(goalTarget, 10),
        goal_target_date: goalDate,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Financial Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Monthly Income (IDR)</Label>
            <Input
              type="number"
              value={monthlyIncome}
              onChange={e => setMonthlyIncome(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{formatIDR(parseInt(monthlyIncome || '0', 10))}</p>
          </div>

          <div className="space-y-2">
            <Label>Marriage Fund Goal Target (IDR)</Label>
            <Input
              type="number"
              value={goalTarget}
              onChange={e => setGoalTarget(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{formatIDR(parseInt(goalTarget || '0', 10))}</p>
          </div>

          <div className="space-y-2">
            <Label>Goal Target Date</Label>
            <Input
              type="date"
              value={goalDate}
              onChange={e => setGoalDate(e.target.value)}
            />
          </div>

          <Button onClick={handleSave} disabled={isPending} className="w-full">
            {saved ? 'Saved!' : isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 2: Verify build**
```bash
npm run build
```
Expected: Build succeeds.

**Step 3: Commit**
```bash
git add app/\(app\)/settings/
git commit -m "feat: add Settings page for monthly income and goal configuration"
```

---

### Task 13: Final Verification

**Step 1: Full production build**
```bash
npm run build
```
Expected: Build succeeds with no errors.

**Step 2: Start dev server**
```bash
npm run dev
```
Open `http://localhost:3000` in browser.

**Step 3: Manual test checklist**
- [ ] `localhost:3000` redirects to `/login`
- [ ] Sign up with email + password → verify email if required → sign in
- [ ] Redirected to `/dashboard` after sign in
- [ ] Navigate to Accounts → Add 3 accounts: "BCA" (cash/core), "Gold" (investment/core), "Crypto" (investment/satellite)
- [ ] Update BCA balance to 5000000 → card updates
- [ ] Check Supabase dashboard → `balance_history` has a new row
- [ ] Dashboard → Net Worth chart shows data point
- [ ] Rebalancing: with Crypto at 0, satellite is 0% → "Accumulate Satellite" badge appears
- [ ] Marriage Fund progress bar shows current % toward 100M IDR
- [ ] Transactions → Add "Money for Mom" 1000000 → Expense Delta updates
- [ ] Settings → Change monthly income to 25000000 → Save → Dashboard recalculates
- [ ] Dashboard → Export CSV → file downloads with account and transaction data
- [ ] Sign out → redirected to `/login`
- [ ] Navigate to `/dashboard` directly → redirected to `/login`

**Step 4: Final commit**
```bash
git add -A && git commit -m "feat: complete Celengan personal finance app"
```
