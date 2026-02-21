import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NetWorthChart } from '@/components/charts/NetWorthChart'
import { RebalancingSuggester } from '@/components/RebalancingSuggester'
import { MarriageFundGoal } from '@/components/MarriageFundGoal'
import { ExpenseDelta } from '@/components/ExpenseDelta'
import { ExportCSV } from '@/components/ExportCSV'
import {
  calcNetWorth,
  calcUnaccountedSpending,
  calcPerAccountDeltas,
  formatIDR,
} from '@/lib/calculations'
import { upsertSettings } from '@/app/actions/settings'
import type { Account, BalanceHistoryRow } from '@/lib/calculations'

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

  // Current month's transactions (for global delta card)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const { data: txRows } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user!.id)
    .gte('date', monthStart)
    .order('date', { ascending: false })

  const transactions = (txRows ?? []) as {
    amount: number
    type: 'spending' | 'income'
    description: string
    category: string | null
    date: string
  }[]
  const spendingTotal = transactions.filter(t => t.type === 'spending').reduce((sum, t) => sum + t.amount, 0)
  const incomeTotal = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const netTransactionSpending = spendingTotal - incomeTotal

  // All balance_history for per-account delta, ordered newest first
  const { data: allSnapshotRows } = await supabase
    .from('balance_history')
    .select('id, account_id, balance_at_time, previous_balance, recorded_at')
    .in('account_id', accounts.length > 0 ? accounts.map(a => a.id) : ['00000000-0000-0000-0000-000000000000'])
    .order('recorded_at', { ascending: false })

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

  // Previous snapshot date per account (window start for per-account reconciliation)
  const prevSnapshotDates = new Map<string, string>()
  const latestIds = new Set(latestSnapshots.map(l => l.id))
  const seenForPrev = new Set<string>()
  for (const s of snapshots) {
    if (!latestIds.has(s.id) && !seenForPrev.has(s.account_id)) {
      prevSnapshotDates.set(s.account_id, s.recorded_at.slice(0, 10))
      seenForPrev.add(s.account_id)
    }
  }

  // prevTotal for global delta: sum of previous_balance from latest snapshots
  let prevTotal = 0
  for (const s of latestSnapshots) {
    prevTotal += s.previous_balance
  }

  const monthlyIncome = settings?.monthly_income ?? 20000000
  const totalDelta = Math.max(0, prevTotal + monthlyIncome - netWorth)
  const unaccountedSpending = calcUnaccountedSpending(
    netWorth,
    prevTotal,
    monthlyIncome,
    netTransactionSpending
  )

  // All transactions for per-account delta (not month-scoped)
  const { data: allTxRows } = await supabase
    .from('transactions')
    .select('account_id, amount, type, date')
    .eq('user_id', user!.id)

  const allTransactions = (allTxRows ?? []) as {
    account_id: string | null
    amount: number
    type: 'spending' | 'income'
    date: string
  }[]

  const accountDeltas = calcPerAccountDeltas(accounts, latestSnapshots, allTransactions, prevSnapshotDates)

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

  const exportTransactions = transactions.map(t => ({
    description: t.description,
    amount: t.amount,
    category: t.category,
    date: t.date,
    type: t.type,
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

      {/* Per-Account Reconciliation */}
      {accountDeltas.some(d => Math.abs(d.unaccounted) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Reconciliation</CardTitle>
            <p className="text-xs text-muted-foreground">
              Accounts with unaccounted balance changes
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {accountDeltas
                .filter(d => Math.abs(d.unaccounted) > 0)
                .map(d => (
                  <div
                    key={d.accountId}
                    className="flex items-center justify-between p-3 bg-amber-500/10 rounded-md"
                  >
                    <div>
                      <p className="font-medium text-sm">{d.accountName}</p>
                      <p className="text-xs text-muted-foreground">
                        Balance changed{' '}
                        <span className={d.rawDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {d.rawDelta >= 0 ? '+' : ''}{formatIDR(d.rawDelta)}
                        </span>
                        {' · '}
                        <span className="text-amber-400">{formatIDR(Math.abs(d.unaccounted))} unexplained</span>
                      </p>
                    </div>
                    <a
                      href={`/transactions?account=${d.accountId}`}
                      className="text-xs text-amber-400 hover:underline shrink-0 ml-4"
                    >
                      Add details →
                    </a>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

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
            spendingTotal={spendingTotal}
            incomeTotal={incomeTotal}
            totalDelta={totalDelta}
          />
        </CardContent>
      </Card>
    </div>
  )
}
