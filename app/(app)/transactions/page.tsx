import { createClient } from '@/lib/supabase/server'
import { TransactionsClient } from './TransactionsClient'
import { calcUnaccountedSpending } from '@/lib/calculations'

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
    .select('id, name, balance')
    .eq('user_id', user!.id)
    .order('created_at')

  const accounts = (accountRows ?? []) as { id: string; name: string; balance: number }[]

  // Build transaction query — filter by account if provided
  let txQuery = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user!.id)
    .order('date', { ascending: false })

  if (accountFilter) {
    txQuery = txQuery.eq('account_id', accountFilter)
  } else {
    // When showing all, still scope to current month for global view
    txQuery = txQuery.gte('date', monthStart)
  }

  const [{ data: txRows }, { data: settings }, { data: historyRows }] = await Promise.all([
    txQuery,
    supabase.from('settings').select('monthly_income').eq('user_id', user!.id).single(),
    supabase
      .from('balance_history')
      .select('balance_at_time, previous_balance, account_id')
      .in('account_id', accounts.length > 0 ? accounts.map(a => a.id) : ['00000000-0000-0000-0000-000000000000'])
      .order('recorded_at', { ascending: false }),
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

  const currentTotal = accounts.reduce((s, a) => s + a.balance, 0)
  const spendingTotal = transactions.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0)
  const incomeTotal = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const netTransactionSpending = spendingTotal - incomeTotal
  const monthlyIncome = settings?.monthly_income ?? 20000000

  // Latest snapshot per account for prevTotal
  const seenAccounts = new Set<string>()
  let prevTotal = 0
  for (const row of historyRows ?? []) {
    if (!seenAccounts.has(row.account_id)) {
      seenAccounts.add(row.account_id)
      prevTotal += row.previous_balance
    }
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
    />
  )
}
