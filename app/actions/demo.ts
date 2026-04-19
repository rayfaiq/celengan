'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signInAsDemo() {
  const email = process.env.DEMO_USER_EMAIL
  const password = process.env.DEMO_USER_PASSWORD

  if (!email || !password) {
    throw new Error('Demo account not configured')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    throw new Error('Demo sign-in failed: ' + error.message)
  }

  redirect('/dashboard')
}
