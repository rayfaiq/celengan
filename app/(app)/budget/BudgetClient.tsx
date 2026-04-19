'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DemoModal } from '@/components/DemoModal'
import { AmountInput } from '@/components/AmountInput'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIDR, calcBudgetSummary } from '@/lib/calculations'
import { createTransaction } from '@/app/actions/transactions'
import { useLanguage } from '@/lib/language-context'
import { getTranslation } from '@/lib/translations'
import { useRouter } from 'next/navigation'

type BudgetData = {
  monthlyBudget: number
  spentThisMonth: number
  rollover: number
  transactions: {
    id: string
    description: string
    amount: number
    date: string
    account_id: string | null
    category: string | null
  }[]
}

type Props = {
  budgetData: BudgetData
  accounts: { id: string; name: string }[]
  currentMonth: string // "YYYY-MM"
  isDemo?: boolean
}

export function BudgetClient({ budgetData, accounts, currentMonth, isDemo = false }: Props) {
  const { language } = useLanguage()
  const t = (key: string) => getTranslation(language, key as any)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [demoModalOpen, setDemoModalOpen] = useState(false)
  const [desc, setDesc] = useState('')
  const [amountValue, setAmountValue] = useState<number | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const summary = calcBudgetSummary(
    budgetData.monthlyBudget,
    budgetData.spentThisMonth,
    budgetData.rollover
  )

  // Month navigation
  const [year, monthNum] = currentMonth.split('-').map(Number)
  const prevMonth = monthNum === 1
    ? `${year - 1}-12`
    : `${year}-${String(monthNum - 1).padStart(2, '0')}`
  const nextMonth = monthNum === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNum + 1).padStart(2, '0')}`
  const isCurrentMonth = currentMonth === new Date().toISOString().slice(0, 7)
  const monthLabel = new Date(year, monthNum - 1).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })

  function handleCreate() {
    if (isDemo) { setDemoModalOpen(true); return }
    if (!desc.trim() || amountValue == null || amountValue <= 0) return
    startTransition(async () => {
      await createTransaction({
        description: desc.trim(),
        amount: amountValue,
        date,
        type: 'spending',
        account_id: selectedAccountId || undefined,
        is_budget: true,
      })
      setOpen(false)
      setDesc('')
      setAmountValue(null)
      setSelectedAccountId('')
    })
  }

  // Progress bar color
  const barColor = summary.percentUsed >= 80
    ? 'bg-red-500'
    : summary.percentUsed >= 50
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  return (
    <div className="space-y-6">
      {/* Header with month nav */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('budget')}</h1>
        <div className="flex items-center gap-2">
          <a href={`/budget?month=${prevMonth}`}>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </a>
          <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
          {!isCurrentMonth && (
            <a href={`/budget?month=${nextMonth}`}>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Budget summary card */}
      {summary.monthlyBudget === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">{t('noBudgetSet')}</p>
            <a href="/settings" className="text-emerald-400 text-sm hover:underline">
              {t('settings')} →
            </a>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('budgetRemaining')}
            </CardTitle>
            <p className={cn(
              'text-3xl font-bold',
              summary.remaining >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {formatIDR(summary.remaining)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('budgetSpent')}: {formatIDR(summary.spentThisMonth)} {t('budgetOf')} {formatIDR(summary.totalBudget)}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={cn('h-3 rounded-full transition-all', barColor)}
                style={{ width: `${Math.min(100, summary.percentUsed)}%` }}
              />
            </div>

            {summary.rollover !== 0 && (
              <p className="text-xs text-muted-foreground">
                {t('budgetRollover')}: {summary.rollover >= 0 ? '+' : ''}{formatIDR(summary.rollover)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add budget transaction button + table */}
      {summary.monthlyBudget > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('budgetTransaction')}</h2>
            {isCurrentMonth && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={isDemo ? (e) => { e.preventDefault(); setDemoModalOpen(true) } : undefined}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('addBudgetTransaction')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('addBudgetTransaction')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                        placeholder="e.g. Buy games"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (IDR)</Label>
                      <AmountInput value={amountValue} onChange={setAmountValue} />
                    </div>
                    <div className="space-y-2">
                      <Label>Account (optional)</Label>
                      <select
                        value={selectedAccountId}
                        onChange={e => setSelectedAccountId(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">— No account —</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                    <Button onClick={handleCreate} className="w-full" disabled={isPending}>
                      {isPending ? 'Adding...' : 'Add'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {budgetData.transactions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              {t('noBudgetTransactions')}
            </p>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetData.transactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-muted-foreground text-sm">{tx.date}</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {accounts.find(a => a.id === tx.account_id)?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium text-red-400">
                        -{formatIDR(tx.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <DemoModal open={demoModalOpen} onClose={() => setDemoModalOpen(false)} />
    </div>
  )
}
