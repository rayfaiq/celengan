import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// This route MUST hit the DB on every invocation, so it can never be
// statically cached — a cached response would skip the query and silently
// recreate the pause bug it exists to prevent.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify the request is from Vercel Cron — but only if a secret is
  // configured, so the route works immediately after deploy and becomes
  // locked down the moment CRON_SECRET is set on the Vercel project.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
  }

  // One lightweight, real PostgREST query. This counts as project activity
  // and resets Supabase's 7-day inactivity timer.
  const supabase = createServiceClient()
  const { error } = await supabase.from('settings').select('id').limit(1)

  if (error) {
    console.error('Keep-alive query failed:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString() })
}
