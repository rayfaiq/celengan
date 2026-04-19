'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatIDR, calcBudgetSummary } from '@/lib/calculations'
import { cn } from '@/lib/utils'

type Props = {
  monthlyBudget: number
  spentThisMonth: number
  rollover: number
}

export function BudgetCard({ monthlyBudget, spentThisMonth, rollover }: Props) {
  if (monthlyBudget === 0) return null

  const summary = calcBudgetSummary(monthlyBudget, spentThisMonth, rollover)

  const barColor = summary.percentUsed >= 80
    ? 'bg-red-500'
    : summary.percentUsed >= 50
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  return (
    <Link href="/budget">
      <Card className="hover:border-emerald-500/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className={cn(
              'text-2xl font-bold',
              summary.remaining >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {formatIDR(summary.remaining)}
            </p>
            <p className="text-sm text-muted-foreground">
              / {formatIDR(summary.totalBudget)}
            </p>
          </div>

          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={cn('h-2 rounded-full transition-all', barColor)}
              style={{ width: `${Math.min(100, summary.percentUsed)}%` }}
            />
          </div>

          {summary.rollover > 0 && (
            <p className="text-xs text-muted-foreground">
              +{formatIDR(summary.rollover)} rollover
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
