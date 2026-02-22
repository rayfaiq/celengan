'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateBalance(accountId: string, newBalance: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Fetch current balance to store as previous_balance in history
  const { data: existing } = await supabase
    .from('accounts')
    .select('balance')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single()

  const previousBalance = existing?.balance ?? 0

  const { error: updateError } = await supabase
    .from('accounts')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (updateError) throw updateError

  const { error: historyError } = await supabase
    .from('balance_history')
    .insert({ account_id: accountId, balance_at_time: newBalance, previous_balance: previousBalance })

  if (historyError) throw historyError

  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  revalidatePath('/history')
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

export async function deleteBalanceHistory(historyId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Verify the history entry belongs to user's account
  const { data: historyData } = await supabase
    .from('balance_history')
    .select('account_id')
    .eq('id', historyId)
    .single()

  if (!historyData) throw new Error('History entry not found')

  // Verify account belongs to user
  const { data: accountData } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', historyData.account_id)
    .eq('user_id', user.id)
    .single()

  if (!accountData) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('balance_history')
    .delete()
    .eq('id', historyId)

  if (error) throw error

  revalidatePath('/history')
}

export async function updateBalanceHistory(
  historyId: string,
  newBalance: number,
  newPreviousBalance: number
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Verify the history entry belongs to user's account
  const { data: historyData } = await supabase
    .from('balance_history')
    .select('account_id')
    .eq('id', historyId)
    .single()

  if (!historyData) throw new Error('History entry not found')

  // Verify account belongs to user
  const { data: accountData } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', historyData.account_id)
    .eq('user_id', user.id)
    .single()

  if (!accountData) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('balance_history')
    .update({
      balance_at_time: newBalance,
      previous_balance: newPreviousBalance,
    })
    .eq('id', historyId)

  if (error) throw error

  revalidatePath('/history')
}
