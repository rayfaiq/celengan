import { createClient } from '@/lib/supabase/server'
import { HistoryClient } from './HistoryClient'
import type { Account } from '@/lib/calculations'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch all accounts
  const { data: accountsData } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .order('name')

  const accounts: Account[] = (accountsData ?? []).map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    category: a.category,
    balance: a.balance,
    balance_mode: a.balance_mode as 'manual' | 'auto',
  }))

  // Fetch all balance history with account information
  interface HistoryItem {
    id: string
    accountId: string
    balanceAtTime: number
    previousBalance: number
    createdAt: Date
  }

  let history: HistoryItem[] = []

  if (accounts.length > 0) {
    const { data: historyData } = await supabase
      .from('balance_history')
      .select('id, account_id, balance_at_time, previous_balance, recorded_at')
      .in('account_id', accounts.map(a => a.id))
      .order('recorded_at', { ascending: false })

    history = (historyData ?? []).map(item => ({
      id: item.id,
      accountId: item.account_id,
      balanceAtTime: item.balance_at_time,
      previousBalance: item.previous_balance,
      createdAt: new Date(item.recorded_at),
    }))
  }

  return <HistoryClient accounts={accounts} history={history} />
}
