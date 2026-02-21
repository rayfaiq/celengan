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
    id: a.id,
    name: a.name,
    type: a.type,
    category: a.category,
    balance: a.balance,
  }))

  const netWorth = calcNetWorth(accounts)

  // Current month's transactions
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const { data: txRows } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user!.id)
    .gte('date', monthStart)
    .order('date', { ascending: false })

  const transactions = txRows ?? []
  const transactionTotal = transactions.reduce(
    (sum: number, t: { amount: number }) => sum + t.amount,
    0
  )

  // Previous month balance (latest snapshot per account before this month)
  const { data: historyRows } = await supabase
    .from('balance_history')
    .select('balance_at_time, recorded_at, account_id')
    .lt('recorded_at', monthStart)
    .order('recorded_at', { ascending: false })

  const seenAccounts = new Set<string>()
  let prevTotal = 0
  for (const row of historyRows ?? []) {
    if (!seenAccounts.has(row.account_id)) {
      seenAccounts.add(row.account_id)
      prevTotal += row.balance_at_time
    }
  }

  const monthlyIncome = settings?.monthly_income ?? 20000000
  const totalDelta = Math.max(0, prevTotal + monthlyIncome - netWorth)
  const unaccountedSpending = calcUnaccountedSpending(
    netWorth,
    prevTotal,
    monthlyIncome,
    transactionTotal
  )

  // Net worth chart: aggregate balance_history by month (last 6)
  const { data: allHistory } = await supabase
    .from('balance_history')
    .select('balance_at_time, recorded_at, account_id')
    .order('recorded_at', { ascending: true })

  const latestPerAccountPerMonth = new Map<string, Map<string, number>>()
  for (const row of allHistory ?? []) {
    const month = row.recorded_at.slice(0, 7)
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

  const exportTransactions = transactions.map((t: {
    description: string
    amount: number
    category: string | null
    date: string
  }) => ({
    description: t.description,
    amount: t.amount,
    category: t.category,
    date: t.date,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <ExportCSV accounts={accounts} transactions={exportTransactions} />
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
