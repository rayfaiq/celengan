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
import { Plus, Trash2, Pencil } from 'lucide-react'
import { updateBalance, createAccount, deleteAccount } from '@/app/actions/accounts'
import { formatIDR } from '@/lib/calculations'
import type { Account } from '@/lib/calculations'

export function AccountsClient({ accounts }: { accounts: Account[] }) {
  const [isPending, startTransition] = useTransition()
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [newBalance, setNewBalance] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'cash' | 'investment'>('cash')
  const [newCategory, setNewCategory] = useState<'core' | 'satellite'>('core')

  function handleUpdateBalance(account: Account) {
    const balance = parseInt(newBalance.replace(/[^0-9]/g, ''), 10)
    if (isNaN(balance)) return
    startTransition(() => {
      updateBalance(account.id, balance)
      setEditAccount(null)
      setNewBalance('')
    })
  }

  function handleCreate() {
    if (!newName.trim()) return
    startTransition(() => {
      createAccount({ name: newName.trim(), type: newType, category: newCategory })
      setAddOpen(false)
      setNewName('')
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this account and all its history?')) return
    startTransition(() => deleteAccount(id))
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
              <Button onClick={handleCreate} className="w-full" disabled={isPending}>
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
              <div className="flex gap-1">
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
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold mb-3">{formatIDR(account.balance)}</p>
              <Dialog
                open={editAccount?.id === account.id}
                onOpenChange={open => {
                  setEditAccount(open ? account : null)
                  setNewBalance('')
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
                      <Input
                        type="number"
                        value={newBalance}
                        onChange={e => setNewBalance(e.target.value)}
                        placeholder={account.balance.toString()}
                        autoFocus
                      />
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
