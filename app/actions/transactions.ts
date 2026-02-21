'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createTransaction(data: {
  description: string
  amount: number
  category?: string
  date: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('transactions')
    .insert({ ...data, user_id: user.id })

  if (error) throw error

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
}

export async function deleteTransaction(transactionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', user.id)

  if (error) throw error

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
}
