import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseTransactionMessage, type TransactionIntent } from '@/lib/gemini'
import { formatCurrency } from '@/lib/currency'

// ─── Meta WhatsApp Cloud API reply helper ─────────────────────────────────────
async function metaReply(to: string, message: string): Promise<void> {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID!
  const token = process.env.META_WHATSAPP_TOKEN!

  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    }),
  })
}

// ─── Reply messages ───────────────────────────────────────────────────────────
function getSetupInstructions(lang: 'id' | 'en'): string {
  if (lang === 'id') {
    return `Halo! Nomor WhatsApp kamu belum terdaftar di Celengan.\n\nBuka aplikasi Celengan → Settings → WhatsApp Integration, lalu masukkan nomor HP kamu untuk mulai.`
  }
  return `Hi! Your WhatsApp number isn't registered in Celengan yet.\n\nOpen the Celengan app → Settings → WhatsApp Integration, and enter your phone number to get started.`
}

function getClarificationRequest(lang: 'id' | 'en'): string {
  if (lang === 'id') {
    return `Maaf, saya tidak mengerti pesanmu. Coba kirim seperti:\n• "Beli kopi 25rb"\n• "Gajian 5jt"\n• "Bayar listrik 150rb"\n• Ketik "bantuan" untuk info lebih lanjut`
  }
  return `Sorry, I didn't understand that. Try sending:\n• "Coffee 25000"\n• "Salary 5000000"\n• "Electric bill 150000"\n• Type "help" for more info`
}

function getHelpMessage(lang: 'id' | 'en', accounts: Array<{ name: string }>): string {
  const acctList = accounts.map(a => `• ${a.name}`).join('\n')
  if (lang === 'id') {
    return `*Celengan Bot* - Catat transaksi via WhatsApp\n\n*Contoh pesan:*\n• "Beli makan siang 35rb"\n• "Gajian 6jt"\n• "Bayar listrik 150rb dari BRI"\n\n*Akunmu:*\n${acctList || '(Belum ada akun)'}\n\n*Perintah:*\n• "saldo" - lihat saldo\n• "transaksi" - transaksi bulan ini`
  }
  return `*Celengan Bot* - Log transactions via WhatsApp\n\n*Example messages:*\n• "Lunch 35000"\n• "Salary 6000000"\n• "Electric bill 150000 from BRI"\n\n*Your accounts:*\n${acctList || '(No accounts yet)'}\n\n*Commands:*\n• "balance" - view balances\n• "transactions" - this month's transactions`
}

// ─── GET handler — Meta webhook verification ──────────────────────────────────
// Meta sends a GET request to verify the webhook endpoint during setup
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// ─── POST handler — incoming WhatsApp messages ────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()

    // Meta wraps messages in a nested structure
    const entry = body?.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value

    // Ignore non-message events (status updates, etc.)
    if (!value?.messages?.[0]) {
      return NextResponse.json({ ok: true })
    }

    const msg = value.messages[0]

    // Only handle text messages
    if (msg.type !== 'text') {
      return NextResponse.json({ ok: true })
    }

    const senderRaw: string = msg.from // e.g. "628123456789" (no + prefix)
    const messageBody: string = msg.text?.body ?? ''
    // Normalize to E.164 format with "+" prefix to match what's stored in settings
    const phone = `+${senderRaw}`

    if (!messageBody) {
      return NextResponse.json({ ok: true })
    }

    const supabase = createServiceClient()

    // 1. Look up user by WhatsApp phone in settings table
    const { data: settingsRow, error: lookupError } = await supabase
      .from('settings')
      .select('user_id')
      .eq('whatsapp_phone', phone)
      .single()

    if (lookupError || !settingsRow) {
      const langGuess = /[a-zA-Z]/.test(messageBody) ? 'en' : 'id'
      await metaReply(senderRaw, getSetupInstructions(langGuess as 'id' | 'en'))
      return NextResponse.json({ ok: true })
    }

    const userId = settingsRow.user_id

    // 2. Fetch user's accounts
    const { data: accountRows } = await supabase
      .from('accounts')
      .select('id, name, balance, type, category')
      .eq('user_id', userId)
      .order('name')

    const accounts = accountRows ?? []

    // 3. Parse message with Gemini
    let intent: TransactionIntent
    try {
      intent = await parseTransactionMessage(messageBody, accounts)
    } catch (err) {
      console.error('Gemini parse error:', err)
      await metaReply(senderRaw, getClarificationRequest('en'))
      return NextResponse.json({ ok: true })
    }

    const lang = intent.language

    // 4. Handle intent types
    if (intent.type === 'unclear') {
      await metaReply(senderRaw, getClarificationRequest(lang))
      return NextResponse.json({ ok: true })
    }

    if (intent.type === 'query') {
      if (intent.query_type === 'help') {
        await metaReply(senderRaw, getHelpMessage(lang, accounts))
        return NextResponse.json({ ok: true })
      }

      if (intent.query_type === 'balance') {
        const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
        const lines = accounts.map(a => `• ${a.name}: ${formatCurrency(a.balance)}`)
        const total = `\n*Total: ${formatCurrency(totalBalance)}*`
        await metaReply(
          senderRaw,
          lang === 'id'
            ? `*Saldo Akunmu:*\n${lines.join('\n')}${total}`
            : `*Your Account Balances:*\n${lines.join('\n')}${total}`
        )
        return NextResponse.json({ ok: true })
      }

      if (intent.query_type === 'transactions') {
        const monthStart = new Date()
        monthStart.setDate(1)
        const { data: txRows } = await supabase
          .from('transactions')
          .select('description, amount, type, date')
          .eq('user_id', userId)
          .gte('date', monthStart.toISOString().slice(0, 10))
          .order('date', { ascending: false })
          .limit(10)
        const txList = (txRows ?? [])
          .map(
            t =>
              `• ${t.date}: ${t.description} ${t.type === 'spending' ? '-' : '+'}${formatCurrency(t.amount)}`
          )
          .join('\n')
        await metaReply(
          senderRaw,
          lang === 'id'
            ? `*Transaksi Bulan Ini:*\n${txList || 'Belum ada transaksi.'}`
            : `*This Month's Transactions:*\n${txList || 'No transactions yet.'}`
        )
        return NextResponse.json({ ok: true })
      }
    }

    if (intent.type === 'spending' || intent.type === 'income') {
      // 5. Resolve account_id if account_name was mentioned
      let accountId: string | null = null
      if (intent.account_name) {
        const normalised = intent.account_name.toLowerCase()
        const matched = accounts.find(
          a =>
            a.name.toLowerCase().includes(normalised) ||
            normalised.includes(a.name.toLowerCase())
        )
        if (matched) accountId = matched.id
      }

      // 6. Insert transaction
      const today = new Date().toISOString().slice(0, 10)
      const { error: insertError } = await supabase.from('transactions').insert({
        user_id: userId,
        account_id: accountId,
        description: intent.description,
        amount: intent.amount,
        category: intent.category,
        date: today,
        type: intent.type,
      })

      if (insertError) {
        console.error('Transaction insert error:', insertError)
        await metaReply(
          senderRaw,
          lang === 'id'
            ? 'Maaf, terjadi kesalahan saat menyimpan transaksi. Coba lagi.'
            : 'Sorry, there was an error saving the transaction. Please try again.'
        )
        return NextResponse.json({ ok: true })
      }

      // 7. Build confirmation reply
      const emoji = intent.type === 'spending' ? '💸' : '💰'
      const verb =
        intent.type === 'spending'
          ? lang === 'id' ? 'Pengeluaran' : 'Spending'
          : lang === 'id' ? 'Pemasukan' : 'Income'
      const acctName = accountId ? accounts.find(a => a.id === accountId)?.name ?? '' : ''
      const acctLine = acctName ? `\nAkun: ${acctName}` : ''
      const catLine = intent.category ? `\nKategori: ${intent.category}` : ''

      await metaReply(
        senderRaw,
        `${emoji} ${verb} dicatat!\n` +
          `${intent.description}\n` +
          `${formatCurrency(intent.amount)}` +
          acctLine +
          catLine +
          `\n\n_${lang === 'id' ? 'Lihat detail di app Celengan' : 'View details in the Celengan app'}_`
      )
      return NextResponse.json({ ok: true })
    }

    await metaReply(senderRaw, getClarificationRequest(lang))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('WhatsApp webhook error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
