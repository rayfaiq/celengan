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
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [whatsappSaved, setWhatsappSaved] = useState(false)
  const [whatsappError, setWhatsappError] = useState('')

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
            if (data.whatsapp_phone) {
              setWhatsappPhone(data.whatsapp_phone)
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

  async function handleSaveWhatsapp() {
    setWhatsappError('')
    const cleaned = whatsappPhone.trim()
    if (!/^\+[0-9]{7,15}$/.test(cleaned)) {
      setWhatsappError('Format: +62812xxxx (include country code)')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('settings')
      .upsert({ user_id: user.id, whatsapp_phone: cleaned }, { onConflict: 'user_id' })

    if (error) {
      if (error.code === '23505') {
        // unique violation
        setWhatsappError('This phone number is already registered to another account.')
      } else {
        setWhatsappError('Failed to save. Try again.')
      }
    } else {
      setWhatsappSaved(true)
      setTimeout(() => setWhatsappSaved(false), 2000)
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
          <CardTitle className="text-base">WhatsApp Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your WhatsApp number to log transactions by sending messages. Powered by Meta WhatsApp Cloud API (official, free).
          </p>
          <div className="space-y-2">
            <Label>Your WhatsApp Number</Label>
            <Input
              type="tel"
              placeholder="+628123456789"
              value={whatsappPhone}
              onChange={e => setWhatsappPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Include country code (e.g. +62 for Indonesia)</p>
            {whatsappError && <p className="text-xs text-destructive">{whatsappError}</p>}
          </div>
          <Button onClick={handleSaveWhatsapp} className="w-full">
            {whatsappSaved ? 'Saved!' : 'Save WhatsApp Number'}
          </Button>
          <div className="rounded-md bg-muted p-3 text-xs space-y-1">
            <p className="font-medium">Setup Instructions:</p>
            <p>1. Create a Meta Developer app at developers.facebook.com</p>
            <p>2. Add WhatsApp product, get Phone Number ID & Token</p>
            <p>3. Set webhook URL to your app URL + /api/whatsapp</p>
            <p>4. Add META_PHONE_NUMBER_ID, META_WHATSAPP_TOKEN, META_WEBHOOK_VERIFY_TOKEN to .env.local</p>
            <p>5. Save your number above, then send "saldo" to test</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
