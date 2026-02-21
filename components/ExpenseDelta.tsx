import { formatIDR } from '@/lib/calculations'
import { AlertTriangle, CheckCircle } from 'lucide-react'

type Props = {
  unaccountedSpending: number
  spendingTotal: number
  incomeTotal: number
  totalDelta: number
}

export function ExpenseDelta({ unaccountedSpending, spendingTotal, incomeTotal, totalDelta }: Props) {
  const isHealthy = unaccountedSpending <= 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-sm">
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">Total Spending</p>
          <p className="font-bold text-red-400">{formatIDR(totalDelta)}</p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">Spending</p>
          <p className="font-bold text-red-400">{formatIDR(spendingTotal)}</p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">Income</p>
          <p className="font-bold text-emerald-400">{formatIDR(incomeTotal)}</p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">Unaccounted</p>
          <p className={`font-bold ${isHealthy ? 'text-emerald-400' : 'text-amber-400'}`}>
            {formatIDR(unaccountedSpending)}
          </p>
        </div>
      </div>
      <div
        className={`flex items-center gap-2 p-3 rounded-md text-sm ${
          isHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
        }`}
      >
        {isHealthy ? (
          <>
            <CheckCircle className="h-4 w-4 shrink-0" />
            All spending is accounted for.
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {formatIDR(unaccountedSpending)} in untracked spending. Add transactions to detail it.
          </>
        )}
      </div>
    </div>
  )
}
