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
import { createTransaction, deleteTransaction } from '@/app/actions/transactions'
import { ExpenseDelta } from '@/components/ExpenseDelta'
import { formatIDR } from '@/lib/calculations'

type Transaction = {
  id: string
  description: string
  amount: number
  category: string | null
  date: string
}

type Props = {
  transactions: Transaction[]
  unaccountedSpending: number
  transactionTotal: number
  totalDelta: number
}

export function TransactionsClient({
  transactions,
  unaccountedSpending,
  transactionTotal,
  totalDelta,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  function handleCreate() {
    const amt = parseInt(amount, 10)
    if (!desc.trim() || isNaN(amt)) return
    startTransition(() => {
      createTransaction({
        description: desc.trim(),
        amount: amt,
        category: category || undefined,
        date,
      })
      setOpen(false)
      setDesc('')
      setAmount('')
      setCategory('')
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
                <Label>Description</Label>
                <Input
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="e.g. Money for Mom"
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (IDR)</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="500000"
                />
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

      <ExpenseDelta
        unaccountedSpending={unaccountedSpending}
        transactionTotal={transactionTotal}
        totalDelta={totalDelta}
      />

      {transactions.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-12">
          No transactions this month.
        </p>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
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
                  <TableCell className="text-right font-medium">{formatIDR(t.amount)}</TableCell>
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
