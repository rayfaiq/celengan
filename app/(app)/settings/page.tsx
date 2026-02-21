'use client'

import { useState, useTransition, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { upsertSettings } from '@/app/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatIDR } from '@/lib/calculations'

export default function SettingsPage() {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [monthlyIncome, setMonthlyIncome] = useState('20000000')
  const [goalTarget, setGoalTarget] = useState('100000000')
  const [goalDate, setGoalDate] = useState('2027-11-01')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setMonthlyIncome(data.monthly_income.toString())
            setGoalTarget(data.goal_target.toString())
            setGoalDate(data.goal_target_date)
          }
        })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    startTransition(async () => {
      await upsertSettings({
        monthly_income: parseInt(monthlyIncome, 10),
        goal_target: parseInt(goalTarget, 10),
        goal_target_date: goalDate,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Financial Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Monthly Income (IDR)</Label>
            <Input
              type="number"
              value={monthlyIncome}
              onChange={e => setMonthlyIncome(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {formatIDR(parseInt(monthlyIncome || '0', 10))}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Marriage Fund Goal Target (IDR)</Label>
            <Input
              type="number"
              value={goalTarget}
              onChange={e => setGoalTarget(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {formatIDR(parseInt(goalTarget || '0', 10))}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Goal Target Date</Label>
            <Input type="date" value={goalDate} onChange={e => setGoalDate(e.target.value)} />
          </div>

          <Button onClick={handleSave} disabled={isPending} className="w-full">
            {saved ? 'Saved!' : isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
