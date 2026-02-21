'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Account } from '@/lib/calculations'

type Transaction = {
  description: string
  amount: number
  category: string | null
  date: string
}

type Props = {
  accounts: Account[]
  transactions: Transaction[]
}

export function ExportCSV({ accounts, transactions }: Props) {
  function handleExport() {
    const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })

    const rows: string[] = [
      `Celengan Financial Summary - ${month}`,
      '',
      'ACCOUNTS',
      'Name,Type,Category,Balance',
      ...accounts.map(a => `${a.name},${a.type},${a.category},${a.balance}`),
      '',
      'TRANSACTIONS',
      'Date,Description,Category,Amount',
      ...transactions.map(t => `${t.date},${t.description},${t.category ?? ''},${t.amount}`),
    ]

    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `celengan-${new Date().toISOString().slice(0, 7)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export CSV
    </Button>
  )
}
