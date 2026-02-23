import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseTransactionMessage, type TransactionIntent } from '@/lib/gemini'
import { formatCurrency } from '@/lib/currency'

// ─── Telegram Bot API reply helper ────────────────────────────────────────────
async function telegramReply(chatId: number, message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN!
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  })
}

// ─── Reply messages ───────────────────────────────────────────────────────────
function getSetupInstructions(lang: 'id' | 'en'): string {
  if (lang === 'id') {
    return `Halo! Username Telegram kamu belum terdaftar di Celengan.\n\nBuka aplikasi Celengan → Settings → Telegram Integration, lalu masukkan username Telegram kamu untuk mulai.`
  }
  return `Hi! Your Telegram username isn't registered in Celengan yet.\n\nOpen the Celengan app → Settings → Telegram Integration, and enter your Telegram username to get started.`
}

function getClarificationRequest(lang: 'id' | 'en'): string {
  if (lang === 'id') {
    return `Maaf, saya tidak mengerti pesanmu. Coba kirim seperti:\n• "Beli kopi 25rb"\n• "Gajian 5jt"\n• "Bayar listrik 150rb"\n• Ketik /bantuan untuk info lebih lanjut`
  }
  return `Sorry, I didn't understand that. Try sending:\n• "Coffee 25000"\n• "Salary 5000000"\n• "Electric bill 150000"\n• Type /help for more info`
}

function getHelpMessage(lang: 'id' | 'en', accounts: Array<{ name: string }>): string {
  const acctList = accounts.map(a => `• ${a.name}`).join('\n')
  if (lang === 'id') {
    return `*Celengan Bot* - Catat transaksi via Telegram\n\n*Contoh pesan:*\n• "Beli makan siang 35rb"\n• "Gajian 6jt"\n• "Bayar listrik 150rb dari BRI"\n\n*Akunmu:*\n${acctList || '(Belum ada akun)'}\n\n*Perintah:*\n• /saldo - lihat saldo\n• /transaksi - transaksi bulan ini`
  }
  return `*Celengan Bot* - Log transactions via Telegram\n\n*Example messages:*\n• "Lunch 35000"\n• "Salary 6000000"\n• "Electric bill 150000 from BRI"\n\n*Your accounts:*\n${acctList || '(No accounts yet)'}\n\n*Commands:*\n• /balance - view balances\n• /transactions - this month's transactions`
}

// ─── POST handler — incoming Telegram updates ─────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()

    // Telegram sends updates with a message object
    const message = body?.message
    if (!message) {
      return NextResponse.json({ ok: true })
    }

    // Only handle text messages
    if (!message.text) {
      return NextResponse.json({ ok: true })
    }

    const chatId: number = message.chat.id
    const username: string | undefined = message.from?.username
    const messageBody: string = message.text ?? ''

    if (!messageBody) {
      return NextResponse.json({ ok: true })
    }

    const langGuess = /[a-zA-Z]/.test(messageBody) ? 'en' : 'id'

    if (!username) {
      await telegramReply(chatId, getSetupInstructions(langGuess as 'id' | 'en'))
      return NextResponse.json({ ok: true })
    }

    const supabase = createServiceClient()

    // 1. Look up user by Telegram username in settings table
    const { data: settingsRow, error: lookupError } = await supabase
      .from('settings')
      .select('user_id')
      .eq('telegram_username', username)
      .single()

    if (lookupError || !settingsRow) {
      await telegramReply(chatId, getSetupInstructions(langGuess as 'id' | 'en'))
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
      await telegramReply(chatId, getClarificationRequest('en'))
      return NextResponse.json({ ok: true })
    }

    const lang = intent.language

    // 4. Handle intent types
    if (intent.type === 'unclear') {
      await telegramReply(chatId, getClarificationRequest(lang))
      return NextResponse.json({ ok: true })
    }

    if (intent.type === 'query') {
      if (intent.query_type === 'help') {
        await telegramReply(chatId, getHelpMessage(lang, accounts))
        return NextResponse.json({ ok: true })
      }

      if (intent.query_type === 'balance') {
        const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
        const lines = accounts.map(a => `• ${a.name}: ${formatCurrency(a.balance)}`)
        const total = `\n*Total: ${formatCurrency(totalBalance)}*`
        await telegramReply(
          chatId,
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
        await telegramReply(
          chatId,
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
        await telegramReply(
          chatId,
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

      await telegramReply(
        chatId,
        `${emoji} ${verb} dicatat!\n` +
          `${intent.description}\n` +
          `${formatCurrency(intent.amount)}` +
          acctLine +
          catLine +
          `\n\n_${lang === 'id' ? 'Lihat detail di app Celengan' : 'View details in the Celengan app'}_`
      )
      return NextResponse.json({ ok: true })
    }

    await telegramReply(chatId, getClarificationRequest(lang))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
