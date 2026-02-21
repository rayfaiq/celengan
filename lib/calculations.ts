export type Account = {
  id: string
  name: string
  type: 'cash' | 'investment'
  category: 'core' | 'satellite'
  balance: number
}

export type BalanceHistoryRow = {
  id: string
  account_id: string
  balance_at_time: number
  previous_balance: number
  recorded_at: string
}

export type AccountDelta = {
  accountId: string
  accountName: string
  rawDelta: number       // balance_at_time - previous_balance
  linkedNet: number      // sum(income) - sum(spending) linked to this account
  unaccounted: number    // rawDelta - linkedNet
  lastUpdated: string    // recorded_at of the latest snapshot
}

export function calcNetWorth(accounts: Account[]): number {
  return accounts.reduce((sum, a) => sum + a.balance, 0)
}

export function calcPerAccountDeltas(
  accounts: Account[],
  latestSnapshots: BalanceHistoryRow[],
  transactions: { account_id: string | null; amount: number; type: 'spending' | 'income'; date: string }[],
  snapshotPrevDates: Map<string, string>
): AccountDelta[] {
  return accounts.map(account => {
    const snapshot = latestSnapshots.find(s => s.account_id === account.id)
    if (!snapshot) return null

    const rawDelta = snapshot.balance_at_time - snapshot.previous_balance
    const prevSnapshotDate = snapshotPrevDates.get(account.id) ?? '1970-01-01'

    const linked = transactions.filter(
      t =>
        t.account_id === account.id &&
        t.date >= prevSnapshotDate &&
        t.date <= snapshot.recorded_at.slice(0, 10)
    )

    const linkedIncome = linked.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const linkedSpending = linked.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0)
    const linkedNet = linkedIncome - linkedSpending

    return {
      accountId: account.id,
      accountName: account.name,
      rawDelta,
      linkedNet,
      unaccounted: rawDelta - linkedNet,
      lastUpdated: snapshot.recorded_at,
    } satisfies AccountDelta
  }).filter((d): d is AccountDelta => d !== null)
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

export function parseAmountInput(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase().replace(/\s/g, '')
  if (!trimmed) return null

  const jtMatch = trimmed.match(/^([\d.]+)jt$/)
  if (jtMatch) {
    const base = parseFloat(jtMatch[1])
    return isNaN(base) ? null : Math.round(base * 1_000_000)
  }

  const kMatch = trimmed.match(/^([\d.]+)k$/)
  if (kMatch) {
    const base = parseFloat(kMatch[1])
    return isNaN(base) ? null : Math.round(base * 1_000)
  }

  // No suffix: dots are thousand separators (Indonesian format), comma is decimal
  const plain = trimmed.replace(/\./g, '').replace(',', '.')
  const base = parseFloat(plain)
  return isNaN(base) ? null : Math.round(base)
}
