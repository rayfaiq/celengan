import { createClient } from '@/lib/supabase/server'
import { TransactionsClient } from './TransactionsClient'
import { calcUnaccountedSpending, calcPerAccountDeltas } from '@/lib/calculations'
import type { BalanceHistoryRow, Account } from '@/lib/calculations'

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>
}) {
  const { account: accountFilter } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  // Fetch accounts for the filter tabs and form dropdown
  const { data: accountRows } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .order('updated_at')

  const accounts = (accountRows ?? []).map(a => ({
    id: a.id, name: a.name, type: a.type, category: a.category, balance: a.balance,
  })) as Account[]

  // Build transaction query — filter by account if provided
  let txQuery = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user!.id)
    .order('date', { ascending: false })

  if (accountFilter) {
    txQuery = txQuery.eq('account_id', accountFilter)
  } else {
    txQuery = txQuery.gte('date', monthStart)
  }

  const accountIds = accounts.length > 0
    ? accounts.map(a => a.id)
    : ['00000000-0000-0000-0000-000000000000']

  const [{ data: txRows }, { data: settings }, { data: allSnapshotRows }, { data: allTxRows }] =
    await Promise.all([
      txQuery,
      supabase.from('settings').select('monthly_income').eq('user_id', user!.id).single(),
      supabase
        .from('balance_history')
        .select('id, account_id, balance_at_time, previous_balance, recorded_at')
        .in('account_id', accountIds)
        .order('recorded_at', { ascending: false }),
      supabase
        .from('transactions')
        .select('account_id, amount, type, date')
        .eq('user_id', user!.id),
    ])

  const transactions = (txRows ?? []) as {
    id: string
    description: string
    amount: number
    category: string | null
    date: string
    type: 'spending' | 'income'
    account_id: string | null
  }[]

  const snapshots = (allSnapshotRows ?? []) as BalanceHistoryRow[]

  // Latest snapshot per account
  const latestSnapshots: BalanceHistoryRow[] = []
  const seenForLatest = new Set<string>()
  for (const s of snapshots) {
    if (!seenForLatest.has(s.account_id)) {
      seenForLatest.add(s.account_id)
      latestSnapshots.push(s)
    }
  }

  // Previous snapshot dates
  const prevSnapshotDates = new Map<string, string>()
  const latestIds = new Set(latestSnapshots.map(l => l.id))
  const seenForPrev = new Set<string>()
  for (const s of snapshots) {
    if (!latestIds.has(s.id) && !seenForPrev.has(s.account_id)) {
      prevSnapshotDates.set(s.account_id, s.recorded_at.slice(0, 10))
      seenForPrev.add(s.account_id)
    }
  }

  const allTransactions = (allTxRows ?? []) as {
    account_id: string | null; amount: number; type: 'spending' | 'income'; date: string
  }[]

  const accountDeltas = calcPerAccountDeltas(accounts, latestSnapshots, allTransactions, prevSnapshotDates)

  // Global delta for the expense delta card
  const currentTotal = accounts.reduce((s, a) => s + a.balance, 0)
  const spendingTotal = transactions.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0)
  const incomeTotal = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const netTransactionSpending = spendingTotal - incomeTotal
  const monthlyIncome = settings?.monthly_income ?? 20000000

  let prevTotal = 0
  for (const s of latestSnapshots) {
    prevTotal += s.previous_balance
  }

  const totalDelta = Math.max(0, prevTotal + monthlyIncome - currentTotal)
  const unaccountedSpending = calcUnaccountedSpending(
    currentTotal,
    prevTotal,
    monthlyIncome,
    netTransactionSpending
  )

  return (
    <TransactionsClient
      transactions={transactions}
      unaccountedSpending={unaccountedSpending}
      spendingTotal={spendingTotal}
      incomeTotal={incomeTotal}
      totalDelta={totalDelta}
      accounts={accounts}
      accountFilter={accountFilter}
      accountDeltas={accountDeltas}
    />
  )
}
