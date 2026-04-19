import { getBudgetSummary } from '@/app/actions/budget'
import { createClient } from '@/lib/supabase/server'
import { BudgetClient } from './BudgetClient'
import { isDemoUser } from '@/lib/demo'

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('user_id', user!.id)
    .order('name')

  const budgetData = await getBudgetSummary(params.month)
  const isDemo = isDemoUser(user!.id)

  return (
    <BudgetClient
      budgetData={budgetData}
      accounts={accounts ?? []}
      currentMonth={params.month ?? new Date().toISOString().slice(0, 7)}
      isDemo={isDemo}
    />
  )
}
