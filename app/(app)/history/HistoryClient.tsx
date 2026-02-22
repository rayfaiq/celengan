'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { X, Trash2, Edit2 } from 'lucide-react'
import { deleteBalanceHistory, updateBalanceHistory } from '@/app/actions/accounts'
import { formatCurrency } from '@/lib/currency'
import { useLanguage } from '@/lib/language-context'
import { getTranslation } from '@/lib/translations'
import type { Account } from '@/lib/calculations'

interface HistoryEntry {
  id: string
  accountId: string
  balanceAtTime: number
  previousBalance: number
  createdAt: Date
}

interface HistoryClientProps {
  accounts: Account[]
  history: HistoryEntry[]
}

interface MonthData {
  monthKey: string
  month: string
  date: Date
  accountEntries: Record<string, HistoryEntry[]>
  accountBalances: Record<string, number>
  totalNetworth: number
}

export function HistoryClient({ accounts, history }: HistoryClientProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ balance: string; previousBalance: string }>({
    balance: '',
    previousBalance: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { language } = useLanguage()

  const accountMap = useMemo(() => {
    return new Map(accounts.map(a => [a.id, a]))
  }, [accounts])

  const allMonthsData = useMemo(() => {
    const grouped: Record<string, MonthData> = {}
    const now = new Date()

    // Initialize all months for the past 12 months
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthKey = format(date, 'yyyy-MM')
      const monthLabel = format(date, 'MMMM yyyy')

      grouped[monthKey] = {
        monthKey,
        month: monthLabel,
        date,
        accountEntries: {},
        accountBalances: {},
        totalNetworth: 0,
      }

      // Initialize account balances for this month
      accounts.forEach(account => {
        grouped[monthKey].accountBalances[account.id] = 0
      })
    }

    // Group history entries by month
    history.forEach(entry => {
      const monthKey = format(entry.createdAt, 'yyyy-MM')

      if (grouped[monthKey]) {
        if (!grouped[monthKey].accountEntries[entry.accountId]) {
          grouped[monthKey].accountEntries[entry.accountId] = []
        }
        grouped[monthKey].accountEntries[entry.accountId].push(entry)
      }
    })

    // Calculate account balances and total networth for each month
    Object.keys(grouped).forEach(monthKey => {
      let totalNetworth = 0

      accounts.forEach(account => {
        const entries = grouped[monthKey].accountEntries[account.id] ?? []
        if (entries.length > 0) {
          // Get the most recent balance for this account in this month
          const latestEntry = entries.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0]
          grouped[monthKey].accountBalances[account.id] = latestEntry.balanceAtTime
          totalNetworth += latestEntry.balanceAtTime
        } else {
          // If no entries for this account in this month, networth is 0
          grouped[monthKey].accountBalances[account.id] = 0
        }
      })

      grouped[monthKey].totalNetworth = totalNetworth
    })

    // Return months sorted by date descending
    return Object.values(grouped).sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [history, accounts])

  const selectedMonthData = selectedMonth ? allMonthsData.find(m => m.monthKey === selectedMonth) : null

  const handleDelete = async (historyId: string) => {
    if (!confirm('Are you sure you want to delete this balance log?')) return

    setIsLoading(true)
    setError(null)

    try {
      await deleteBalanceHistory(historyId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditStart = (entry: HistoryEntry) => {
    setEditingId(entry.id)
    setEditValues({
      balance: entry.balanceAtTime.toString(),
      previousBalance: entry.previousBalance.toString(),
    })
    setError(null)
  }

  const handleEditSave = async (historyId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const newBalance = parseFloat(editValues.balance)
      const newPreviousBalance = parseFloat(editValues.previousBalance)

      if (isNaN(newBalance) || isNaN(newPreviousBalance)) {
        setError('Please enter valid numbers')
        return
      }

      await updateBalanceHistory(historyId, newBalance, newPreviousBalance)
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditCancel = () => {
    setEditingId(null)
    setError(null)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">{getTranslation(language, 'balanceHistory')}</h1>

      {allMonthsData.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">{getTranslation(language, 'noHistoryFound')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allMonthsData.map(monthData => (
            <button
              key={monthData.monthKey}
              onClick={() => setSelectedMonth(monthData.monthKey)}
              className="rounded-lg border border-border bg-card p-4 hover:border-emerald-500 hover:bg-emerald-500/5 transition-all cursor-pointer text-left space-y-3"
            >
              <div className="flex items-start justify-between">
                <h2 className="font-semibold text-sm">{monthData.month}</h2>
                {monthData.totalNetworth > 0 && (
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">
                    {Object.values(monthData.accountEntries).some(entries => entries.length > 0) ? getTranslation(language, 'active') : getTranslation(language, 'noChanges')}
                  </span>
                )}
              </div>

              {/* Total Networth */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{getTranslation(language, 'totalNetworth')}</p>
                <p className="text-2xl font-bold text-emerald-500">
                  {formatCurrency(monthData.totalNetworth, 'IDR')}
                </p>
              </div>

              {/* Account Balances */}
              <div className="space-y-1 pt-2 border-t border-border">
                {accounts.map(account => {
                  const balance = monthData.accountBalances[account.id]
                  const hasEntries = (monthData.accountEntries[account.id]?.length ?? 0) > 0

                  return (
                    <div key={account.id} className="flex items-center justify-between text-xs">
                      <span className={hasEntries ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                        {account.name}
                      </span>
                      <span className={hasEntries ? 'text-emerald-400' : 'text-muted-foreground'}>
                        {formatCurrency(balance, 'IDR')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedMonthData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">{selectedMonthData.month}</h2>
              </div>
              <button
                onClick={() => setSelectedMonth(null)}
                className="p-1 hover:bg-accent rounded transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-sm text-red-500">{error}</p>
                </div>
              )}

              {/* Total Networth Summary */}
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">{getTranslation(language, 'totalNetworth')}</p>
                <p className="text-3xl font-bold text-emerald-500">
                  {formatCurrency(selectedMonthData.totalNetworth, 'IDR')}
                </p>
              </div>

              {/* Account Details */}
              <div className="space-y-4">
                {accounts.map(account => {
                  const accountEntries = selectedMonthData.accountEntries[account.id] ?? []
                  const sortedEntries = [...accountEntries].sort((a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  )

                  return (
                    <div key={account.id} className="border border-border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{account.name}</h3>
                        <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">
                          {account.type === 'cash' ? '💰' : '📈'} {getTranslation(language, account.category as 'core' | 'satellite')}
                        </span>
                      </div>

                      {sortedEntries.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {sortedEntries.length} {getTranslation(language, sortedEntries.length > 1 ? 'updates' : 'update')}
                          </p>
                          <div className="space-y-2">
                            {sortedEntries.map(entry => {
                              const isEditing = editingId === entry.id

                              return (
                                <div
                                  key={entry.id}
                                  className="bg-background/50 rounded p-3 space-y-2"
                                >
                                  {isEditing ? (
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">
                                          {format(entry.createdAt, 'MMM dd, HH:mm')}
                                        </span>
                                      </div>

                                      <div className="space-y-2">
                                        <div>
                                          <label className="text-xs text-muted-foreground">{getTranslation(language, 'previousBalance')}</label>
                                          <input
                                            type="number"
                                            step="1"
                                            value={editValues.previousBalance}
                                            onChange={(e) =>
                                              setEditValues({
                                                ...editValues,
                                                previousBalance: e.target.value,
                                              })
                                            }
                                            className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1"
                                            disabled={isLoading}
                                          />
                                        </div>

                                        <div>
                                          <label className="text-xs text-muted-foreground">{getTranslation(language, 'newBalance')}</label>
                                          <input
                                            type="number"
                                            step="1"
                                            value={editValues.balance}
                                            onChange={(e) =>
                                              setEditValues({
                                                ...editValues,
                                                balance: e.target.value,
                                              })
                                            }
                                            className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1"
                                            disabled={isLoading}
                                          />
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 pt-2">
                                        <button
                                          onClick={() => handleEditSave(entry.id)}
                                          disabled={isLoading}
                                          className="flex-1 px-2 py-1 text-xs bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white rounded transition-colors"
                                        >
                                          {isLoading ? getTranslation(language, 'saving') : getTranslation(language, 'save')}
                                        </button>
                                        <button
                                          onClick={handleEditCancel}
                                          disabled={isLoading}
                                          className="flex-1 px-2 py-1 text-xs bg-muted hover:bg-muted/80 disabled:bg-muted/50 rounded transition-colors"
                                        >
                                          {getTranslation(language, 'cancel')}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center justify-between text-xs mb-2">
                                          <span className="text-muted-foreground">
                                            {format(entry.createdAt, 'MMM dd, HH:mm')}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-mono text-xs">
                                            {formatCurrency(entry.previousBalance, 'IDR')}
                                          </span>
                                          <span className="text-muted-foreground text-xs">→</span>
                                          <span className="font-mono font-medium text-xs">
                                            {formatCurrency(entry.balanceAtTime, 'IDR')}
                                          </span>
                                          <span className={`font-medium text-xs ${
                                            entry.balanceAtTime >= entry.previousBalance
                                              ? 'text-emerald-500'
                                              : 'text-red-500'
                                          }`}>
                                            {entry.balanceAtTime >= entry.previousBalance ? '+' : ''}
                                            {formatCurrency(entry.balanceAtTime - entry.previousBalance, 'IDR')}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1 ml-2">
                                        <button
                                          onClick={() => handleEditStart(entry)}
                                          className="p-1 hover:bg-accent rounded transition-colors"
                                          title="Edit"
                                        >
                                          <Edit2 className="h-4 w-4 text-blue-500" />
                                        </button>
                                        <button
                                          onClick={() => handleDelete(entry.id)}
                                          disabled={isLoading}
                                          className="p-1 hover:bg-accent rounded transition-colors disabled:opacity-50"
                                          title="Delete"
                                        >
                                          <Trash2 className="h-4 w-4 text-red-500" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">{getTranslation(language, 'noUpdatesThisMonth')}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
