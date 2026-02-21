import { Progress } from '@/components/ui/progress'
import { Heart } from 'lucide-react'
import { calcGoalProgress, formatIDR } from '@/lib/calculations'

type Props = {
  netWorth: number
  goalTarget: number
  goalTargetDate: string
}

export function MarriageFundGoal({ netWorth, goalTarget, goalTargetDate }: Props) {
  const { progressPct, monthsRemaining, monthlyNeeded } = calcGoalProgress(
    netWorth,
    goalTarget,
    new Date(goalTargetDate)
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-rose-400" />
          <span className="text-muted-foreground">Marriage Fund</span>
        </div>
        <span className="font-medium">{progressPct.toFixed(1)}%</span>
      </div>
      <Progress value={progressPct} className="h-3" />
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-muted rounded-md p-2">
          <p className="text-xs text-muted-foreground">Target</p>
          <p className="font-medium">{formatIDR(goalTarget)}</p>
        </div>
        <div className="bg-muted rounded-md p-2">
          <p className="text-xs text-muted-foreground">Current</p>
          <p className="font-medium">{formatIDR(netWorth)}</p>
        </div>
        <div className="bg-muted rounded-md p-2">
          <p className="text-xs text-muted-foreground">Months Left</p>
          <p className="font-medium">{monthsRemaining} months</p>
        </div>
        <div className="bg-muted rounded-md p-2">
          <p className="text-xs text-muted-foreground">Need/Month</p>
          <p className="font-medium">{formatIDR(monthlyNeeded)}</p>
        </div>
      </div>
    </div>
  )
}
