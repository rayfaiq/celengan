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
  const [telegramUsername, setTelegramUsername] = useState('')
  const [telegramSaved, setTelegramSaved] = useState(false)
  const [telegramError, setTelegramError] = useState('')

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
            if (data.telegram_username) {
              setTelegramUsername(data.telegram_username)
            }
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

  async function handleSaveTelegram() {
    setTelegramError('')
    const cleaned = telegramUsername.trim().replace(/^@/, '')
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(cleaned)) {
      setTelegramError('Enter a valid Telegram username (5–32 chars, letters/numbers/underscores)')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('settings')
      .upsert({ user_id: user.id, telegram_username: cleaned }, { onConflict: 'user_id' })

    if (error) {
      if (error.code === '23505') {
        setTelegramError('This Telegram username is already registered to another account.')
      } else {
        setTelegramError('Failed to save. Try again.')
      }
    } else {
      setTelegramSaved(true)
      setTimeout(() => setTelegramSaved(false), 2000)
    }
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telegram Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your Telegram account to log transactions by sending messages to your bot.
          </p>
          <div className="space-y-2">
            <Label>Your Telegram Username</Label>
            <Input
              type="text"
              placeholder="username (without @)"
              value={telegramUsername}
              onChange={e => setTelegramUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Find your username in Telegram → Settings → Username</p>
            {telegramError && <p className="text-xs text-destructive">{telegramError}</p>}
          </div>
          <Button onClick={handleSaveTelegram} className="w-full">
            {telegramSaved ? 'Saved!' : 'Save Telegram Username'}
          </Button>
          <div className="rounded-md bg-muted p-3 text-xs space-y-1">
            <p className="font-medium">Setup Instructions:</p>
            <p>1. Open Telegram and chat with @BotFather</p>
            <p>2. Send /newbot, follow the steps, copy your Bot Token</p>
            <p>3. Add TELEGRAM_BOT_TOKEN to .env.local</p>
            <p>4. Set webhook: GET https://api.telegram.org/bot{'<TOKEN>'}/setWebhook?url={'<app-url>'}/api/telegram</p>
            <p>5. Save your username above, then send "saldo" to your bot to test</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
