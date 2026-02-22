import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client using the service role key.
 * This bypasses Row Level Security and is ONLY safe for:
 * - Server-side webhook handlers (app/api/whatsapp/route.ts)
 * - Never expose this to the browser
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
