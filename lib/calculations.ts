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
