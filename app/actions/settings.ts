'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function upsertSettings(data: {
  monthly_income: number
  goal_target: number
  goal_target_date: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('settings')
    .upsert({ ...data, user_id: user.id }, { onConflict: 'user_id' })

  if (error) throw error

  revalidatePath('/dashboard')
  revalidatePath('/settings')
}
