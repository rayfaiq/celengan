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
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Pencil, RefreshCw } from 'lucide-react'
import { updateBalance, createAccount, deleteAccount, updateAccountMode } from '@/app/actions/accounts'
import { formatIDR } from '@/lib/calculations'
import { AmountInput } from '@/components/AmountInput'
import type { Account } from '@/lib/calculations'

export function AccountsClient({ accounts }: { accounts: Account[] }) {
  const [isPending, startTransition] = useTransition()
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [newBalance, setNewBalance] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'cash' | 'investment'>('cash')
  const [newCategory, setNewCategory] = useState<'core' | 'satellite'>('core')
  const [newBalanceMode, setNewBalanceMode] = useState<'manual' | 'auto'>('manual')
  const [modeEditAccount, setModeEditAccount] = useState<Account | null>(null)
  const [modeEditOpen, setModeEditOpen] = useState(false)

  function handleUpdateBalance(account: Account) {
    if (newBalance == null) return
    startTransition(async () => {
      try {
        await updateBalance(account.id, newBalance)
        setEditAccount(null)
        setNewBalance(null)
      } catch (e) {
        alert('Failed to update balance: ' + (e instanceof Error ? e.message : String(e)))
      }
    })
  }

  function handleCreate() {
    if (!newName.trim()) return
    startTransition(async () => {
      try {
        await createAccount({ name: newName.trim(), type: newType, category: newCategory, balance_mode: newBalanceMode })
        setAddOpen(false)
        setNewName('')
        setNewBalanceMode('manual')
      } catch (e) {
        alert('Failed to create account: ' + (e instanceof Error ? e.message : String(e)))
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this account and all its history?')) return
    startTransition(async () => { await deleteAccount(id) })
  }

  function handleModeChange(account: Account, mode: 'manual' | 'auto') {
    startTransition(async () => {
      try {
        await updateAccountMode(account.id, mode)
        setModeEditOpen(false)
        setModeEditAccount(null)
      } catch (e) {
        alert('Failed to update mode: ' + (e instanceof Error ? e.message : String(e)))
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Account</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. BCA Savings"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2">
                  {(['cash', 'investment'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={`flex-1 py-2 rounded-md text-sm border transition-colors ${
                        newType === t
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <div className="flex gap-2">
                  {(['core', 'satellite'] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCategory(c)}
                      className={`flex-1 py-2 rounded-md text-sm border transition-colors ${
                        newCategory === c
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Balance Mode</Label>
                <div className="flex gap-2">
                  {(['manual', 'auto'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setNewBalanceMode(m)}
                      className={`flex-1 py-2 rounded-md text-sm border transition-colors ${
                        newBalanceMode === m
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {m === 'manual' ? 'Manual' : 'Auto'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {newBalanceMode === 'auto'
                    ? 'Balance updates automatically when you add/delete transactions'
                    : 'Update balance manually via "Update Balance"'}
                </p>
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={isPending}>
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Change Mode Dialog */}
      <Dialog open={modeEditOpen} onOpenChange={open => {
        setModeEditOpen(open)
        if (!open) setModeEditAccount(null)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Balance Mode — {modeEditAccount?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Current mode: <strong>{modeEditAccount?.balance_mode}</strong>
            </p>
            {(['manual', 'auto'] as const).map(m => (
              <button
                key={m}
                type="button"
                disabled={isPending || modeEditAccount?.balance_mode === m}
                onClick={() => modeEditAccount && handleModeChange(modeEditAccount, m)}
                className={`w-full py-3 rounded-md text-sm border transition-colors text-left px-4 ${
                  modeEditAccount?.balance_mode === m
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 cursor-default'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <span className="font-medium block">{m === 'manual' ? 'Manual' : 'Auto'}</span>
                <span className="text-xs">
                  {m === 'auto'
                    ? 'Balance adjusts automatically from transactions'
                    : 'Update balance manually'}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {accounts.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-12">
          No accounts yet. Add one to get started.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(account => (
          <Card key={account.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{account.name}</CardTitle>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-1 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {account.type}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    account.category === 'core' ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {account.category}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    account.balance_mode === 'auto'
                      ? 'text-blue-400 border-blue-400/30'
                      : 'text-muted-foreground'
                  }`}
                >
                  {account.balance_mode === 'auto' ? 'Auto' : 'Manual'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold mb-2">{formatIDR(account.balance)}</p>
              <button
                onClick={() => {
                  setModeEditAccount(account)
                  setModeEditOpen(true)
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Change Mode
              </button>
              {account.balance_mode === 'manual' ? (
                <Dialog
                  open={editAccount?.id === account.id}
                  onOpenChange={open => {
                    if (open) {
                      setEditAccount(account)
                      setNewBalance(account.balance)
                    } else {
                      setEditAccount(null)
                      setNewBalance(null)
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">
                      <Pencil className="h-3 w-3 mr-2" />
                      Update Balance
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Update {account.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label>New Balance (IDR)</Label>
                        <AmountInput key={account.id} value={newBalance} onChange={setNewBalance} autoFocus />
                      </div>
                      <Button
                        onClick={() => handleUpdateBalance(account)}
                        className="w-full"
                        disabled={isPending}
                      >
                        Save Balance
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-1 border border-dashed border-border rounded-md">
                  Balance auto-updates from transactions
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
