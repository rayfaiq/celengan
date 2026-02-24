import { createClient } from '@/lib/supabase/server'
import { AccountsClient } from './AccountsClient'
import type { Account } from '@/lib/calculations'

export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .order('updated_at')

  const accounts: Account[] = (data ?? []).map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    category: a.category,
    balance: a.balance,
    balance_mode: a.balance_mode as 'manual' | 'auto',
  }))

  return <AccountsClient accounts={accounts} />
}
