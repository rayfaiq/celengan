'use server'

import { createClient } from '@/lib/supabase/server'

export async function getBudgetSummary(month?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Get settings for monthly_budget
  const { data: settings } = await supabase
    .from('settings')
    .select('monthly_budget')
    .eq('user_id', user.id)
    .single()

  const monthlyBudget = (settings?.monthly_budget as number) ?? 0

  // Determine target month
  const targetDate = month ? new Date(month + '-01') : new Date()
  const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
    .toISOString().slice(0, 10)
  const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0)
    .toISOString().slice(0, 10)

  // Budget spent this month
  const { data: spentRows } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', user.id)
    .eq('is_budget', true)
    .eq('type', 'spending')
    .gte('date', monthStart)
    .lte('date', monthEnd)

  const spentThisMonth = (spentRows ?? []).reduce((sum, r) => sum + (r.amount as number), 0)

  // Rollover: sum of (monthly_budget - spent) for all months before target month
  const { data: pastRows } = await supabase
    .from('transactions')
    .select('amount, date')
    .eq('user_id', user.id)
    .eq('is_budget', true)
    .eq('type', 'spending')
    .lt('date', monthStart)

  // Group by month
  const monthlySpent = new Map<string, number>()
  for (const row of pastRows ?? []) {
    const key = (row.date as string).slice(0, 7) // "YYYY-MM"
    monthlySpent.set(key, (monthlySpent.get(key) ?? 0) + (row.amount as number))
  }

  let rollover = 0
  for (const spent of monthlySpent.values()) {
    rollover += monthlyBudget - spent
  }

  // Budget transactions for this month
  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, description, amount, date, account_id, category')
    .eq('user_id', user.id)
    .eq('is_budget', true)
    .eq('type', 'spending')
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .order('date', { ascending: false })

  return {
    monthlyBudget,
    spentThisMonth,
    rollover,
    transactions: transactions ?? [],
  }
}
