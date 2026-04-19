# Budget Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a monthly budget feature with rollover, tagged transactions, dashboard card, dedicated page, and Telegram `/spent` command.

**Architecture:** Add `monthly_budget` column to `settings` and `is_budget` boolean to `transactions`. Budget summary is computed by querying tagged transactions grouped by month. New `/budget` page + dashboard card. Telegram bot gets `/spent` command with regex parsing.

**Tech Stack:** Next.js App Router, Supabase PostgreSQL, Server Actions, Tailwind CSS, shadcn/ui, Telegram Bot API

**Note:** This project has no automated test suite (testing is manual per CLAUDE.md), so steps focus on implementation + manual verification.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/010_add_budget.sql` | DB migration: add columns + update RPC |
| Modify | `lib/translations.ts` | Add budget-related i18n strings |
| Modify | `lib/calculations.ts` | Add `BudgetSummary` type and `calcBudgetSummary` function |
| Modify | `app/actions/settings.ts` | Accept `monthly_budget` in upsert |
| Modify | `app/actions/transactions.ts` | Accept `is_budget` param in createTransaction |
| Create | `app/actions/budget.ts` | `getBudgetSummary` server action |
| Create | `app/(app)/budget/page.tsx` | Server component: fetch budget data |
| Create | `app/(app)/budget/BudgetClient.tsx` | Client component: budget page UI |
| Create | `components/BudgetCard.tsx` | Dashboard budget summary card |
| Modify | `app/(app)/dashboard/page.tsx` | Add BudgetCard to dashboard |
| Modify | `components/Sidebar.tsx` | Add Budget nav item |
| Modify | `app/api/telegram/route.ts` | Add `/spent` command handler |
| Modify | `app/(app)/settings/page.tsx` | Add monthly budget input field |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/010_add_budget.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add monthly_budget to settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS monthly_budget bigint NOT NULL DEFAULT 0;

-- Add is_budget flag to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_budget boolean NOT NULL DEFAULT false;

-- Update dashboard RPC to include budget summary
CREATE OR REPLACE FUNCTION get_dashboard_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_settings record;
  v_chart_data jsonb;
  v_accounts jsonb;
  v_account_deltas jsonb;
  v_net_worth bigint;
  v_spending_total bigint;
  v_income_total bigint;
  v_net_transaction_spending bigint;
  v_prev_total bigint;
  v_total_delta bigint;
  v_unaccounted_spending bigint;
  v_transactions_current_month jsonb;
  v_budget_spent_this_month bigint;
  v_budget_rollover bigint;
BEGIN
  -- Settings (with auto-creation)
  SELECT * INTO v_settings FROM public.settings WHERE user_id = p_user_id;
  IF v_settings IS NULL THEN
    INSERT INTO public.settings (user_id, monthly_income, goal_target, goal_target_date)
    VALUES (p_user_id, 20000000, 100000000, '2027-11-01')
    RETURNING * INTO v_settings;
  END IF;

  -- Chart Data (using existing function)
  SELECT jsonb_agg(chart_data) INTO v_chart_data FROM (
    SELECT * FROM get_net_worth_chart_data(p_user_id, 6)
  ) chart_data;

  -- Accounts
  SELECT jsonb_agg(ac) INTO v_accounts FROM (SELECT * FROM accounts WHERE user_id = p_user_id) ac;

  -- Net Worth (sum of current balances)
  SELECT coalesce(sum(balance), 0) INTO v_net_worth FROM accounts WHERE user_id = p_user_id;

  -- Current Month's Transactions
  SELECT
    coalesce(sum(CASE WHEN type = 'spending' THEN amount ELSE 0 END), 0),
    coalesce(sum(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)
  INTO v_spending_total, v_income_total
  FROM transactions
  WHERE user_id = p_user_id AND date >= date_trunc('month', current_date);

  v_net_transaction_spending := v_spending_total - v_income_total;

  SELECT jsonb_agg(tx) INTO v_transactions_current_month FROM (
    SELECT * FROM transactions
    WHERE user_id = p_user_id AND date >= date_trunc('month', current_date)
    ORDER BY date DESC
  ) tx;

  -- Budget: spent this month
  SELECT coalesce(sum(amount), 0) INTO v_budget_spent_this_month
  FROM transactions
  WHERE user_id = p_user_id
    AND is_budget = true
    AND type = 'spending'
    AND date >= date_trunc('month', current_date);

  -- Budget: rollover from all previous months
  SELECT coalesce(sum(v_settings.monthly_budget - month_spent), 0) INTO v_budget_rollover
  FROM (
    SELECT date_trunc('month', date) AS month,
           coalesce(sum(amount), 0) AS month_spent
    FROM transactions
    WHERE user_id = p_user_id
      AND is_budget = true
      AND type = 'spending'
      AND date < date_trunc('month', current_date)
    GROUP BY date_trunc('month', date)
  ) past_months;

  -- Account Deltas
  WITH ranked_snapshots AS (
    SELECT
      b.account_id,
      b.balance_at_time,
      b.recorded_at,
      coalesce(lag(b.balance_at_time) OVER (PARTITION BY b.account_id ORDER BY b.recorded_at), 0) AS previous_balance,
      coalesce(lag(b.recorded_at) OVER (PARTITION BY b.account_id ORDER BY b.recorded_at), '1970-01-01'::timestamptz) AS prev_recorded_at,
      row_number() OVER (PARTITION BY b.account_id ORDER BY b.recorded_at DESC) AS rn
    FROM balance_history b
    JOIN accounts a ON b.account_id = a.id
    WHERE a.user_id = p_user_id
  ),
  latest_snapshots AS (
    SELECT * FROM ranked_snapshots WHERE rn = 1
  ),
  deltas AS (
    SELECT
      ls.account_id AS "accountId",
      a.name AS "accountName",
      (ls.balance_at_time - ls.previous_balance) AS "rawDelta",
      coalesce(t.linked_net, 0) AS "linkedNet",
      (ls.balance_at_time - ls.previous_balance - coalesce(t.linked_net, 0)) AS "unaccounted",
      ls.recorded_at AS "lastUpdated",
      (ls.previous_balance = 0 AND ls.prev_recorded_at = '1970-01-01'::timestamptz) AS "isInitial"
    FROM latest_snapshots ls
    JOIN accounts a ON ls.account_id = a.id
    LEFT JOIN (
      SELECT
        account_id,
        sum(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS linked_net
      FROM transactions
      WHERE user_id = p_user_id AND account_id IS NOT NULL
      GROUP BY account_id
    ) t ON ls.account_id = t.account_id
  )
  SELECT jsonb_agg(d) INTO v_account_deltas FROM deltas d;

  -- Previous total for global delta
  SELECT coalesce(sum(b.previous_balance), 0) INTO v_prev_total FROM (
    SELECT
      (lag(balance_at_time, 1, 0::bigint) OVER (PARTITION BY account_id ORDER BY recorded_at)) AS previous_balance,
      row_number() OVER (PARTITION BY account_id ORDER BY recorded_at DESC) AS rn
    FROM balance_history b
    JOIN accounts a ON b.account_id = a.id
    WHERE a.user_id = p_user_id
  ) b WHERE b.rn = 1;

  v_total_delta := v_prev_total + v_settings.monthly_income - v_net_worth;
  IF v_total_delta < 0 THEN
    v_total_delta := 0;
  END IF;

  v_unaccounted_spending := v_total_delta - v_net_transaction_spending;
  IF v_unaccounted_spending < 0 THEN
    v_unaccounted_spending := 0;
  END IF;

  RETURN jsonb_build_object(
    'settings', to_jsonb(v_settings),
    'chartData', v_chart_data,
    'accounts', v_accounts,
    'accountDeltas', coalesce(v_account_deltas, '[]'::jsonb),
    'netWorth', v_net_worth,
    'spendingTotal', v_spending_total,
    'incomeTotal', v_income_total,
    'totalDelta', v_total_delta,
    'unaccountedSpending', v_unaccounted_spending,
    'transactions', coalesce(v_transactions_current_month, '[]'::jsonb),
    'budgetSpentThisMonth', v_budget_spent_this_month,
    'budgetRollover', v_budget_rollover
  );
END;
$$;
```

- [ ] **Step 2: Run migration against Supabase**

Run the migration SQL in the Supabase SQL Editor (Dashboard → SQL Editor → paste and run).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/010_add_budget.sql
git commit -m "feat(db): add budget columns and update dashboard RPC"
```

---

### Task 2: i18n Translations

**Files:**
- Modify: `lib/translations.ts`

- [ ] **Step 1: Add budget translation keys**

Add these keys to both `id` and `en` sections in the `translations` object, after the existing "Balance Mode" section:

Indonesian (`id`):
```typescript
// Budget
budget: 'Anggaran',
budgetRemaining: 'Sisa Anggaran',
budgetSpent: 'Terpakai',
budgetRollover: 'Sisa Bulan Lalu',
budgetMonthly: 'Anggaran Bulanan',
budgetTransaction: 'Transaksi Anggaran',
noBudgetSet: 'Belum ada anggaran. Atur di Pengaturan.',
noBudgetTransactions: 'Belum ada transaksi anggaran bulan ini.',
addBudgetTransaction: 'Tambah Pengeluaran Anggaran',
budgetOf: 'dari',
```

English (`en`):
```typescript
// Budget
budget: 'Budget',
budgetRemaining: 'Budget Remaining',
budgetSpent: 'Spent',
budgetRollover: 'Rollover',
budgetMonthly: 'Monthly Budget',
budgetTransaction: 'Budget Transaction',
noBudgetSet: 'No budget set. Configure in Settings.',
noBudgetTransactions: 'No budget transactions this month.',
addBudgetTransaction: 'Add Budget Spending',
budgetOf: 'of',
```

- [ ] **Step 2: Commit**

```bash
git add lib/translations.ts
git commit -m "feat(i18n): add budget translation keys"
```

---

### Task 3: Budget Calculation Logic

**Files:**
- Modify: `lib/calculations.ts`

- [ ] **Step 1: Add BudgetSummary type and calcBudgetSummary function**

Add after the existing `calcGoalProgress` function:

```typescript
export type BudgetSummary = {
  monthlyBudget: number
  spentThisMonth: number
  rollover: number
  totalBudget: number  // monthlyBudget + rollover
  remaining: number    // totalBudget - spentThisMonth
  percentUsed: number  // 0-100
}

export function calcBudgetSummary(
  monthlyBudget: number,
  spentThisMonth: number,
  rollover: number
): BudgetSummary {
  const totalBudget = monthlyBudget + rollover
  const remaining = totalBudget - spentThisMonth
  const percentUsed = totalBudget > 0 ? Math.min(100, (spentThisMonth / totalBudget) * 100) : 0

  return {
    monthlyBudget,
    spentThisMonth,
    rollover,
    totalBudget,
    remaining,
    percentUsed,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/calculations.ts
git commit -m "feat: add budget summary calculation logic"
```

---

### Task 4: Server Actions — Settings & Transactions

**Files:**
- Modify: `app/actions/settings.ts`
- Modify: `app/actions/transactions.ts`

- [ ] **Step 1: Extend upsertSettings to accept monthly_budget**

In `app/actions/settings.ts`, change the type parameter to include `monthly_budget`:

```typescript
export async function upsertSettings(data: {
  monthly_income: number
  goal_target: number
  goal_target_date: string
  monthly_budget?: number
}) {
```

The rest of the function stays the same — the spread `{ ...data, user_id: user.id }` will include `monthly_budget` when provided. Add `revalidatePath('/budget')` after the existing revalidations:

```typescript
  revalidatePath('/dashboard')
  revalidatePath('/settings')
  revalidatePath('/budget')
```

- [ ] **Step 2: Extend createTransaction to accept is_budget**

In `app/actions/transactions.ts`, add `is_budget` to the `createTransaction` parameter type:

```typescript
export async function createTransaction(data: {
  description: string
  amount: number
  category?: string
  date: string
  type: 'spending' | 'income'
  account_id?: string
  is_budget?: boolean
}) {
```

The rest stays the same — the spread `{ ...data, user_id: user.id }` will include `is_budget` when provided. Add `revalidatePath('/budget')` after the existing revalidations at the end of the function (there are two places — after the auto-mode block and after the main insert):

Add `revalidatePath('/budget')` next to the existing `revalidatePath('/transactions')` calls (both in `createTransaction` and `deleteTransaction`).

- [ ] **Step 3: Commit**

```bash
git add app/actions/settings.ts app/actions/transactions.ts
git commit -m "feat: extend settings and transactions actions for budget"
```

---

### Task 5: Budget Server Action

**Files:**
- Create: `app/actions/budget.ts`

- [ ] **Step 1: Create getBudgetSummary action**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'

export async function getBudgetSummary(month?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Get settings for monthly_budget
  const { data: settings } = await supabase
    .from('settings')
    .select('monthly_budget')
    .eq('user_id', user.id)
    .single()

  const monthlyBudget = (settings?.monthly_budget as number) ?? 0

  // Determine target month
  const targetDate = month ? new Date(month + '-01') : new Date()
  const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
    .toISOString().slice(0, 10)
  const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0)
    .toISOString().slice(0, 10)

  // Budget spent this month
  const { data: spentRows } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', user.id)
    .eq('is_budget', true)
    .eq('type', 'spending')
    .gte('date', monthStart)
    .lte('date', monthEnd)

  const spentThisMonth = (spentRows ?? []).reduce((sum, r) => sum + (r.amount as number), 0)

  // Rollover: sum of (monthly_budget - spent) for all months before target month
  const { data: pastRows } = await supabase
    .from('transactions')
    .select('amount, date')
    .eq('user_id', user.id)
    .eq('is_budget', true)
    .eq('type', 'spending')
    .lt('date', monthStart)

  // Group by month
  const monthlySpent = new Map<string, number>()
  for (const row of pastRows ?? []) {
    const key = (row.date as string).slice(0, 7) // "YYYY-MM"
    monthlySpent.set(key, (monthlySpent.get(key) ?? 0) + (row.amount as number))
  }

  let rollover = 0
  for (const spent of monthlySpent.values()) {
    rollover += monthlyBudget - spent
  }

  // Budget transactions for this month
  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, description, amount, date, account_id, category')
    .eq('user_id', user.id)
    .eq('is_budget', true)
    .eq('type', 'spending')
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .order('date', { ascending: false })

  return {
    monthlyBudget,
    spentThisMonth,
    rollover,
    transactions: transactions ?? [],
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/actions/budget.ts
git commit -m "feat: add getBudgetSummary server action"
```

---

### Task 6: Budget Page

**Files:**
- Create: `app/(app)/budget/page.tsx`
- Create: `app/(app)/budget/BudgetClient.tsx`

- [ ] **Step 1: Create server component page**

`app/(app)/budget/page.tsx`:

```typescript
import { getBudgetSummary } from '@/app/actions/budget'
import { createClient } from '@/lib/supabase/server'
import { BudgetClient } from './BudgetClient'
import { isDemoUser } from '@/lib/demo'

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', user!.id)
    .order('name')

  const budgetData = await getBudgetSummary(params.month)
  const isDemo = isDemoUser(user!.id)

  return (
    <BudgetClient
      budgetData={budgetData}
      accounts={accounts ?? []}
      currentMonth={params.month ?? new Date().toISOString().slice(0, 7)}
      isDemo={isDemo}
    />
  )
}
```

- [ ] **Step 2: Create client component**

`app/(app)/budget/BudgetClient.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DemoModal } from '@/components/DemoModal'
import { AmountInput } from '@/components/AmountInput'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIDR, calcBudgetSummary } from '@/lib/calculations'
import { createTransaction } from '@/app/actions/transactions'
import { useLanguage } from '@/lib/language-context'
import { getTranslation } from '@/lib/translations'
import { useRouter } from 'next/navigation'

type BudgetData = {
  monthlyBudget: number
  spentThisMonth: number
  rollover: number
  transactions: {
    id: string
    description: string
    amount: number
    date: string
    account_id: string | null
    category: string | null
  }[]
}

type Props = {
  budgetData: BudgetData
  accounts: { id: string; name: string }[]
  currentMonth: string // "YYYY-MM"
  isDemo?: boolean
}

export function BudgetClient({ budgetData, accounts, currentMonth, isDemo = false }: Props) {
  const { language } = useLanguage()
  const t = (key: string) => getTranslation(language, key as any)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [demoModalOpen, setDemoModalOpen] = useState(false)
  const [desc, setDesc] = useState('')
  const [amountValue, setAmountValue] = useState<number | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const summary = calcBudgetSummary(
    budgetData.monthlyBudget,
    budgetData.spentThisMonth,
    budgetData.rollover
  )

  // Month navigation
  const [year, monthNum] = currentMonth.split('-').map(Number)
  const prevMonth = monthNum === 1
    ? `${year - 1}-12`
    : `${year}-${String(monthNum - 1).padStart(2, '0')}`
  const nextMonth = monthNum === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNum + 1).padStart(2, '0')}`
  const isCurrentMonth = currentMonth === new Date().toISOString().slice(0, 7)
  const monthLabel = new Date(year, monthNum - 1).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })

  function handleCreate() {
    if (isDemo) { setDemoModalOpen(true); return }
    if (!desc.trim() || amountValue == null || amountValue <= 0) return
    startTransition(async () => {
      await createTransaction({
        description: desc.trim(),
        amount: amountValue,
        date,
        type: 'spending',
        account_id: selectedAccountId || undefined,
        is_budget: true,
      })
      setOpen(false)
      setDesc('')
      setAmountValue(null)
      setSelectedAccountId('')
    })
  }

  // Progress bar color
  const barColor = summary.percentUsed >= 80
    ? 'bg-red-500'
    : summary.percentUsed >= 50
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  return (
    <div className="space-y-6">
      {/* Header with month nav */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('budget')}</h1>
        <div className="flex items-center gap-2">
          <a href={`/budget?month=${prevMonth}`}>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </a>
          <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
          {!isCurrentMonth && (
            <a href={`/budget?month=${nextMonth}`}>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Budget summary card */}
      {summary.monthlyBudget === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">{t('noBudgetSet')}</p>
            <a href="/settings" className="text-emerald-400 text-sm hover:underline">
              {t('settings')} →
            </a>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('budgetRemaining')}
            </CardTitle>
            <p className={cn(
              'text-3xl font-bold',
              summary.remaining >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {formatIDR(summary.remaining)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('budgetSpent')}: {formatIDR(summary.spentThisMonth)} {t('budgetOf')} {formatIDR(summary.totalBudget)}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={cn('h-3 rounded-full transition-all', barColor)}
                style={{ width: `${Math.min(100, summary.percentUsed)}%` }}
              />
            </div>

            {summary.rollover !== 0 && (
              <p className="text-xs text-muted-foreground">
                {t('budgetRollover')}: {summary.rollover >= 0 ? '+' : ''}{formatIDR(summary.rollover)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add budget transaction button + table */}
      {summary.monthlyBudget > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('budgetTransaction')}</h2>
            {isCurrentMonth && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={isDemo ? (e) => { e.preventDefault(); setDemoModalOpen(true) } : undefined}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('addBudgetTransaction')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('addBudgetTransaction')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                        placeholder="e.g. Buy games"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (IDR)</Label>
                      <AmountInput value={amountValue} onChange={setAmountValue} />
                    </div>
                    <div className="space-y-2">
                      <Label>Account (optional)</Label>
                      <select
                        value={selectedAccountId}
                        onChange={e => setSelectedAccountId(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">— No account —</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                    <Button onClick={handleCreate} className="w-full" disabled={isPending}>
                      {isPending ? 'Adding...' : 'Add'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {budgetData.transactions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              {t('noBudgetTransactions')}
            </p>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetData.transactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-muted-foreground text-sm">{tx.date}</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {accounts.find(a => a.id === tx.account_id)?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium text-red-400">
                        -{formatIDR(tx.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <DemoModal open={demoModalOpen} onClose={() => setDemoModalOpen(false)} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(app)/budget/page.tsx app/(app)/budget/BudgetClient.tsx
git commit -m "feat: add budget page with month navigation and transaction list"
```

---

### Task 7: Dashboard Budget Card

**Files:**
- Create: `components/BudgetCard.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create BudgetCard component**

`components/BudgetCard.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatIDR, calcBudgetSummary } from '@/lib/calculations'
import { cn } from '@/lib/utils'

type Props = {
  monthlyBudget: number
  spentThisMonth: number
  rollover: number
}

export function BudgetCard({ monthlyBudget, spentThisMonth, rollover }: Props) {
  if (monthlyBudget === 0) return null

  const summary = calcBudgetSummary(monthlyBudget, spentThisMonth, rollover)

  const barColor = summary.percentUsed >= 80
    ? 'bg-red-500'
    : summary.percentUsed >= 50
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  return (
    <Link href="/budget">
      <Card className="hover:border-emerald-500/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className={cn(
              'text-2xl font-bold',
              summary.remaining >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {formatIDR(summary.remaining)}
            </p>
            <p className="text-sm text-muted-foreground">
              / {formatIDR(summary.totalBudget)}
            </p>
          </div>

          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={cn('h-2 rounded-full transition-all', barColor)}
              style={{ width: `${Math.min(100, summary.percentUsed)}%` }}
            />
          </div>

          {summary.rollover > 0 && (
            <p className="text-xs text-muted-foreground">
              +{formatIDR(summary.rollover)} rollover
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 2: Add BudgetCard to dashboard**

In `app/(app)/dashboard/page.tsx`, add the import at the top:

```typescript
import { BudgetCard } from '@/components/BudgetCard'
```

Then add the BudgetCard inside the `grid grid-cols-1 md:grid-cols-2 gap-4` div, after the Marriage Fund card:

```tsx
{/* Budget */}
<BudgetCard
  monthlyBudget={settings?.monthly_budget ?? 0}
  spentThisMonth={dashboardData.budgetSpentThisMonth ?? 0}
  rollover={dashboardData.budgetRollover ?? 0}
/>
```

- [ ] **Step 3: Commit**

```bash
git add components/BudgetCard.tsx app/(app)/dashboard/page.tsx
git commit -m "feat: add budget card to dashboard"
```

---

### Task 8: Sidebar Navigation

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Add Budget nav item**

Import `BadgeDollarSign` from lucide-react (add to existing import):

```typescript
import { LayoutDashboard, Wallet, Receipt, Settings, LogOut, PiggyBank, History, BadgeDollarSign } from 'lucide-react'
```

Add the budget item to the `navItems` array, between `transactions` and `history`:

```typescript
const navItems = [
  { href: '/dashboard', labelKey: 'dashboard' as const, icon: LayoutDashboard },
  { href: '/accounts', labelKey: 'accounts' as const, icon: Wallet },
  { href: '/transactions', labelKey: 'transactions' as const, icon: Receipt },
  { href: '/budget', labelKey: 'budget' as const, icon: BadgeDollarSign },
  { href: '/history', labelKey: 'history' as const, icon: History },
  { href: '/settings', labelKey: 'settings' as const, icon: Settings },
]
```

- [ ] **Step 2: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: add budget link to sidebar navigation"
```

---

### Task 9: Settings Page — Monthly Budget Field

**Files:**
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Add monthly budget state and input**

Add state variable after existing state declarations:

```typescript
const [monthlyBudget, setMonthlyBudget] = useState('0')
```

In the `useEffect` data loading block, after `setTelegramUsername`, add:

```typescript
if (data.monthly_budget !== undefined && data.monthly_budget !== null) {
  setMonthlyBudget(data.monthly_budget.toString())
}
```

Update `handleSave` to include `monthly_budget`:

```typescript
function handleSave() {
  if (isDemo) { setDemoModalOpen(true); return }
  startTransition(async () => {
    await upsertSettings({
      monthly_income: parseInt(monthlyIncome, 10),
      goal_target: parseInt(goalTarget, 10),
      goal_target_date: goalDate,
      monthly_budget: parseInt(monthlyBudget, 10) || 0,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  })
}
```

Add the monthly budget input field in the "Financial Configuration" card, after the Goal Target Date input and before the Save button:

```tsx
<div className="space-y-2">
  <Label>Monthly Budget (IDR)</Label>
  <Input
    type="number"
    value={monthlyBudget}
    onChange={e => setMonthlyBudget(e.target.value)}
  />
  <p className="text-xs text-muted-foreground">
    {formatIDR(parseInt(monthlyBudget || '0', 10))} / month for free spending
  </p>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add app/(app)/settings/page.tsx
git commit -m "feat: add monthly budget field to settings page"
```

---

### Task 10: Telegram Bot — `/spent` Command

**Files:**
- Modify: `app/api/telegram/route.ts`

- [ ] **Step 1: Add `/spent` command parser function**

Add this function after the existing `parseAmount` function (around line 103):

```typescript
function parseSpentCommand(
  message: string,
  accounts: Account[]
): { amount: number; accountName: string | null; description: string } | null {
  // Format: /spent <amount> [from <account>] [for <description>]
  const text = message.replace(/^\/spent\s*/i, '').trim()
  if (!text) return null

  // Extract amount (first token with optional suffix)
  const amountMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(jt|juta|rb|ribu|k)?/i)
  if (!amountMatch) return null

  const raw = amountMatch[1].replace(',', '.')
  let amount = parseFloat(raw)
  const suffix = amountMatch[2]?.toLowerCase()
  if (suffix === 'jt' || suffix === 'juta') amount *= 1_000_000
  else if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') amount *= 1_000
  amount = Math.round(amount)
  if (!amount) return null

  const rest = text.slice(amountMatch[0].length).trim()

  // Extract "from <account>"
  let accountName: string | null = null
  let remaining = rest
  const fromMatch = remaining.match(/\bfrom\s+(\S+)/i)
  if (fromMatch) {
    const query = fromMatch[1].toLowerCase()
    const matched = accounts.find(
      a => a.name.toLowerCase().includes(query) || query.includes(a.name.toLowerCase())
    )
    if (matched) accountName = matched.name
    remaining = remaining.replace(fromMatch[0], '').trim()
  }

  // Extract "for <description>"
  let description = 'Budget spending'
  const forMatch = remaining.match(/\bfor\s+(.+)/i)
  if (forMatch) {
    description = forMatch[1].trim()
    description = description.charAt(0).toUpperCase() + description.slice(1)
  }

  return { amount, accountName, description }
}
```

- [ ] **Step 2: Add `/spent` command handler function**

Add this function after `handleSetDefault`:

```typescript
async function handleSpent(
  chatId: number,
  userId: string,
  accounts: Account[],
  defaultAccountId: string | null,
  messageBody: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const parsed = parseSpentCommand(messageBody, accounts)
  if (!parsed) {
    await telegramReply(
      chatId,
      `Format: /spent <jumlah> [from <akun>] [for <deskripsi>]\nContoh: /spent 400k from mandiri for buy games`
    )
    return
  }

  // Resolve account
  let accountId: string | null = null
  let linkedAccount: Account | null = null
  if (parsed.accountName) {
    const normalised = parsed.accountName.toLowerCase()
    linkedAccount = accounts.find(
      a => a.name.toLowerCase().includes(normalised) || normalised.includes(a.name.toLowerCase())
    ) ?? null
    if (linkedAccount) accountId = linkedAccount.id
  }
  if (!accountId && defaultAccountId) {
    accountId = defaultAccountId
    linkedAccount = accounts.find(a => a.id === defaultAccountId) ?? null
  }

  // Insert transaction with is_budget=true
  const today = new Date().toISOString().slice(0, 10)
  const { error: insertError } = await supabase.from('transactions').insert({
    user_id: userId,
    account_id: accountId,
    description: parsed.description,
    amount: parsed.amount,
    category: null,
    date: today,
    type: 'spending',
    is_budget: true,
  })

  if (insertError) {
    console.error('Budget transaction insert error:', insertError)
    await telegramReply(chatId, 'Gagal menyimpan. Coba lagi.')
    return
  }

  // Auto-mode: adjust balance
  let balanceAfter: number | null = null
  if (linkedAccount && linkedAccount.balance_mode === 'auto') {
    balanceAfter = linkedAccount.balance - parsed.amount

    await supabase
      .from('accounts')
      .update({ balance: balanceAfter, updated_at: new Date().toISOString() })
      .eq('id', linkedAccount.id)
      .eq('user_id', userId)

    await supabase.from('balance_history').insert({
      account_id: linkedAccount.id,
      balance_at_time: balanceAfter,
      previous_balance: linkedAccount.balance,
    })
  }

  // Get budget remaining for confirmation
  const { data: settings } = await supabase
    .from('settings')
    .select('monthly_budget')
    .eq('user_id', userId)
    .single()

  const monthlyBudget = (settings?.monthly_budget as number) ?? 0

  const monthStart = new Date()
  monthStart.setDate(1)
  const { data: spentRows } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('is_budget', true)
    .eq('type', 'spending')
    .gte('date', monthStart.toISOString().slice(0, 10))

  const totalSpent = (spentRows ?? []).reduce((sum, r) => sum + (r.amount as number), 0)
  const remaining = monthlyBudget - totalSpent

  const acctName = linkedAccount?.name ?? '(tidak ada akun)'
  let balanceLine = ''
  if (linkedAccount && balanceAfter !== null) {
    balanceLine = `\n🏦 ${linkedAccount.name}: ${formatCurrency(linkedAccount.balance)} → ${formatCurrency(balanceAfter)}`
  } else if (linkedAccount) {
    balanceLine = `\n🏦 Akun: ${linkedAccount.name}`
  }

  await telegramReply(
    chatId,
    `🛒 *Budget dicatat!*\n` +
      `📝 ${parsed.description}\n` +
      `💵 ${formatCurrency(parsed.amount)}` +
      balanceLine +
      `\n\n💰 Sisa budget: ${formatCurrency(remaining)} / ${formatCurrency(monthlyBudget)}`
  )
}
```

- [ ] **Step 3: Wire up `/spent` command in the POST handler**

In the POST handler, add the `/spent` command check after the `/akun` handler block (around line 327) and before the `/bantuan` handler:

```typescript
if (cmd === '/spent') {
  await handleSpent(chatId, userId, accounts, defaultAccountId, messageBody, supabase)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Add `/spent` to help message**

In the `getHelpMessage` function, add the `/spent` line to the commands section:

```typescript
`• /spent 400k from bca for games — budget spending\n` +
```

Add this line after the existing `/saldo BCA 5jt` line.

- [ ] **Step 5: Commit**

```bash
git add app/api/telegram/route.ts
git commit -m "feat: add /spent command to Telegram bot for budget spending"
```

---

### Task 11: Manual Verification

- [ ] **Step 1: Verify migration ran successfully**

Check in Supabase Dashboard → Table Editor:
- `settings` table has `monthly_budget` column
- `transactions` table has `is_budget` column

- [ ] **Step 2: Verify settings page**

1. Go to `/settings`
2. Set a Monthly Budget (e.g. 2000000)
3. Save — should see "Saved!"

- [ ] **Step 3: Verify budget page**

1. Go to `/budget`
2. Should show budget summary with the amount set
3. Add a budget transaction via the dialog
4. Should appear in the table and reduce the remaining amount
5. Navigate months with arrow buttons

- [ ] **Step 4: Verify dashboard card**

1. Go to `/dashboard`
2. Should see Budget card with remaining amount and progress bar
3. Click it — should navigate to `/budget`

- [ ] **Step 5: Verify Telegram `/spent` command**

1. Send `/spent 400k from mandiri for buy games` to your bot
2. Should see confirmation with amount, description, and remaining budget

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete budget feature implementation"
git push
```
