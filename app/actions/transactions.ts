'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createTransaction(data: {
  description: string
  amount: number
  category?: string
  date: string
  type: 'spending' | 'income'
  account_id?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  let accountBalanceMode: 'manual' | 'auto' | null = null
  let currentBalance: number | null = null

  if (data.account_id) {
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, balance, balance_mode')
      .eq('id', data.account_id)
      .eq('user_id', user.id)
      .single()

    if (accountError || !account) {
      throw new Error('Invalid account or unauthorized')
    }

    accountBalanceMode = account.balance_mode as 'manual' | 'auto'
    currentBalance = account.balance as number
  }

  const { error } = await supabase
    .from('transactions')
    .insert({ ...data, user_id: user.id })

  if (error) throw error

  if (data.account_id && accountBalanceMode === 'auto' && currentBalance !== null) {
    const delta = data.type === 'income' ? data.amount : -data.amount
    const newBalance = currentBalance + delta

    const { error: updateError } = await supabase
      .from('accounts')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', data.account_id)
      .eq('user_id', user.id)

    if (updateError) throw updateError

    const { error: historyError } = await supabase
      .from('balance_history')
      .insert({
        account_id: data.account_id,
        balance_at_time: newBalance,
        previous_balance: currentBalance,
      })

    if (historyError) throw historyError

    revalidatePath('/history')
  }

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/accounts')
}

export async function deleteTransaction(transactionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Fetch transaction before deleting so we can reverse auto-mode balance
  const { data: tx, error: fetchError } = await supabase
    .from('transactions')
    .select('id, account_id, amount, type')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !tx) throw new Error('Transaction not found or unauthorized')

  let accountBalanceMode: 'manual' | 'auto' | null = null
  let currentBalance: number | null = null

  if (tx.account_id) {
    const { data: account } = await supabase
      .from('accounts')
      .select('balance, balance_mode')
      .eq('id', tx.account_id)
      .eq('user_id', user.id)
      .single()

    if (account) {
      accountBalanceMode = account.balance_mode as 'manual' | 'auto'
      currentBalance = account.balance as number
    }
  }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', user.id)

  if (error) throw error

  if (tx.account_id && accountBalanceMode === 'auto' && currentBalance !== null) {
    const reverseDelta = tx.type === 'income' ? -(tx.amount as number) : (tx.amount as number)
    const newBalance = currentBalance + reverseDelta

    const { error: updateError } = await supabase
      .from('accounts')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', tx.account_id)
      .eq('user_id', user.id)

    if (updateError) throw updateError

    const { error: historyError } = await supabase
      .from('balance_history')
      .insert({
        account_id: tx.account_id,
        balance_at_time: newBalance,
        previous_balance: currentBalance,
      })

    if (historyError) throw historyError

    revalidatePath('/history')
  }

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/accounts')
}
