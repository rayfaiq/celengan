import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, CheckCircle } from 'lucide-react'
import type { Account } from '@/lib/calculations'
import { calcRebalancingSuggestion } from '@/lib/calculations'

export function RebalancingSuggester({ accounts }: { accounts: Account[] }) {
  const { satellitePct, corePct, suggestion, message } = calcRebalancingSuggestion(accounts)

  const icon =
    suggestion === 'buy_core' ? (
      <TrendingDown className="h-4 w-4" />
    ) : suggestion === 'accumulate_satellite' ? (
      <TrendingUp className="h-4 w-4" />
    ) : (
      <CheckCircle className="h-4 w-4" />
    )

  const variant = suggestion === 'balanced' ? 'default' : 'secondary'

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 bg-muted rounded-md p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Core</p>
          <p className="font-bold text-emerald-400">{(corePct * 100).toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">target 80%</p>
        </div>
        <div className="flex-1 bg-muted rounded-md p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Satellite</p>
          <p className="font-bold text-amber-400">{(satellitePct * 100).toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">target 20%</p>
        </div>
      </div>
      <div className="flex items-start gap-2 p-3 rounded-md bg-muted">
        <Badge variant={variant} className="flex items-center gap-1 shrink-0 mt-0.5">
          {icon}
          {suggestion === 'buy_core'
            ? 'Buy Core'
            : suggestion === 'accumulate_satellite'
            ? 'Accumulate Satellite'
            : 'Balanced'}
        </Badge>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
