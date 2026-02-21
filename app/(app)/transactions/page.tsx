import { createClient } from '@/lib/supabase/server'
import { TransactionsClient } from './TransactionsClient'
import { calcUnaccountedSpending } from '@/lib/calculations'

export default async function TransactionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const [{ data: txRows }, { data: accountRows }, { data: settings }, { data: historyRows }] =
    await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date', monthStart)
        .order('date', { ascending: false }),
      supabase.from('accounts').select('balance').eq('user_id', user!.id),
      supabase.from('settings').select('monthly_income').eq('user_id', user!.id).single(),
      supabase
        .from('balance_history')
        .select('balance_at_time, account_id')
        .lt('recorded_at', monthStart)
        .order('recorded_at', { ascending: false }),
    ])

  const transactions = (txRows ?? []) as {
    id: string
    description: string
    amount: number
    category: string | null
    date: string
  }[]

  const currentTotal = (accountRows ?? []).reduce(
    (s: number, a: { balance: number }) => s + a.balance,
    0
  )
  const transactionTotal = transactions.reduce((s, t) => s + t.amount, 0)
  const monthlyIncome = settings?.monthly_income ?? 20000000

  const seenAccounts = new Set<string>()
  let prevTotal = 0
  for (const row of historyRows ?? []) {
    if (!seenAccounts.has(row.account_id)) {
      seenAccounts.add(row.account_id)
      prevTotal += row.balance_at_time
    }
  }

  const totalDelta = Math.max(0, prevTotal + monthlyIncome - currentTotal)
  const unaccountedSpending = calcUnaccountedSpending(
    currentTotal,
    prevTotal,
    monthlyIncome,
    transactionTotal
  )

  return (
    <TransactionsClient
      transactions={transactions}
      unaccountedSpending={unaccountedSpending}
      transactionTotal={transactionTotal}
      totalDelta={totalDelta}
    />
  )
}
