'use client'

import { useState, useTransition } from 'react'
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
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createTransaction, deleteTransaction } from '@/app/actions/transactions'
import { ExpenseDelta } from '@/components/ExpenseDelta'
import { AmountInput } from '@/components/AmountInput'
import { formatIDR } from '@/lib/calculations'

type Transaction = {
  id: string
  description: string
  amount: number
  category: string | null
  date: string
  type: 'spending' | 'income'
  account_id: string | null
}

type Props = {
  transactions: Transaction[]
  unaccountedSpending: number
  spendingTotal: number
  incomeTotal: number
  totalDelta: number
  accounts: { id: string; name: string }[]
  accountFilter?: string
}

export function TransactionsClient({
  transactions,
  unaccountedSpending,
  spendingTotal,
  incomeTotal,
  totalDelta,
  accounts,
  accountFilter,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [desc, setDesc] = useState('')
  const [amountValue, setAmountValue] = useState<number | null>(null)
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [txType, setTxType] = useState<'spending' | 'income'>('spending')
  const [selectedAccountId, setSelectedAccountId] = useState(accountFilter ?? '')

  function handleCreate() {
    if (!desc.trim() || amountValue == null || amountValue <= 0) return
    startTransition(() => {
      createTransaction({
        description: desc.trim(),
        amount: amountValue,
        category: category || undefined,
        date,
        type: txType,
        account_id: selectedAccountId || undefined,
      })
      setOpen(false)
      setDesc('')
      setAmountValue(null)
      setCategory('')
      setTxType('spending')
      setSelectedAccountId(accountFilter ?? '')
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Transaction
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Transaction</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex rounded-md border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTxType('spending')}
                    className={cn(
                      'flex-1 py-1.5 text-sm font-medium transition-colors',
                      txType === 'spending'
                        ? 'bg-red-500/20 text-red-400'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    Spending
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('income')}
                    className={cn(
                      'flex-1 py-1.5 text-sm font-medium transition-colors border-l border-border',
                      txType === 'income'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    Income
                  </button>
                </div>
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
                <Label>Description</Label>
                <Input
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="e.g. Money for Mom"
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (IDR)</Label>
                <AmountInput value={amountValue} onChange={setAmountValue} />
              </div>
              <div className="space-y-2">
                <Label>Category (optional)</Label>
                <Input
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="e.g. Family"
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={isPending}>
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Account filter tabs */}
      {accounts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <a
            href="/transactions"
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border transition-colors',
              !accountFilter
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            All
          </a>
          {accounts.map(a => (
            <a
              key={a.id}
              href={`/transactions?account=${a.id}`}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-colors',
                accountFilter === a.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {a.name}
            </a>
          ))}
        </div>
      )}

      <ExpenseDelta
        unaccountedSpending={unaccountedSpending}
        spendingTotal={spendingTotal}
        incomeTotal={incomeTotal}
        totalDelta={totalDelta}
      />

      {transactions.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-12">
          No transactions{accountFilter ? ' for this account' : ' this month'}.
        </p>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground text-sm">{t.date}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {t.category ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {accounts.find(a => a.id === t.account_id)?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        t.type === 'income'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-red-400'
                      )}
                    >
                      {t.type === 'income' ? 'Income' : 'Spending'}
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-medium',
                      t.type === 'income' ? 'text-emerald-400' : 'text-red-400'
                    )}
                  >
                    {t.type === 'income' ? '+' : '-'}{formatIDR(t.amount)}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => startTransition(() => deleteTransaction(t.id))}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
