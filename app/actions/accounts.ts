'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateBalance(accountId: string, newBalance: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error: updateError } = await supabase
    .from('accounts')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (updateError) throw updateError

  const { error: historyError } = await supabase
    .from('balance_history')
    .insert({ account_id: accountId, balance_at_time: newBalance })

  if (historyError) throw historyError

  revalidatePath('/dashboard')
  revalidatePath('/accounts')
}

export async function createAccount(data: {
  name: string
  type: 'cash' | 'investment'
  category: 'core' | 'satellite'
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('accounts')
    .insert({ ...data, user_id: user.id, balance: 0 })

  if (error) throw error

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
}

export async function deleteAccount(accountId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (error) throw error

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
}
