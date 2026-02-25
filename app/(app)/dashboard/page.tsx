import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NetWorthChart } from '@/components/charts/NetWorthChart'
import { RebalancingSuggester } from '@/components/RebalancingSuggester'
import { MarriageFundGoal } from '@/components/MarriageFundGoal'
import { ExpenseDelta } from '@/components/ExpenseDelta'
import { ExportCSV } from '@/components/ExportCSV'
import { formatIDR } from '@/lib/calculations'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let { data: dashboardData } = await supabase.rpc('get_dashboard_data', { p_user_id: user!.id }).single()


  const {
    netWorth,
    chartData,
    accounts,
    accountDeltas,
    settings,
    unaccountedSpending,
    spendingTotal,
    incomeTotal,
    totalDelta,
    transactions,
  } = dashboardData

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
      {accountDeltas.some(d => !d.isInitial && Math.abs(d.unaccounted) > 0) && (
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
                .filter(d => !d.isInitial && Math.abs(d.unaccounted) > 0)
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
          <p className="text-xs text-muted-foreground">Income: {formatIDR(settings.monthly_income ?? 20000000)} / month</p>
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
