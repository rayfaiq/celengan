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

type Account = { id: string; name: string; balance: number; type: string; category: string }

// ─── Slash command handlers ───────────────────────────────────────────────────

async function handleSaldo(chatId: number, accounts: Account[]): Promise<void> {
  if (accounts.length === 0) {
    await telegramReply(chatId, 'Belum ada akun. Buat akun dulu di app Celengan.')
    return
  }
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const lines = accounts.map(a => `• ${a.name}: ${formatCurrency(a.balance)}`)
  await telegramReply(
    chatId,
    `*💰 Saldo Akunmu:*\n${lines.join('\n')}\n\n*Total: ${formatCurrency(totalBalance)}*\n\n_Set saldo: /saldo NamaAkun JumlahBaru_\n_Contoh: /saldo BCA 5000000_`
  )
}

// Parse shorthand amounts: 5jt→5000000, 500rb→500000, 5k→5000
function parseAmount(raw: string): number | null {
  const s = raw.toLowerCase().replace(/\./g, '').replace(/,/g, '')
  const m = s.match(/^(\d+(?:\.\d+)?)(jt|juta|rb|ribu|k)?$/)
  if (!m) return null
  const num = parseFloat(m[1])
  if (m[2] === 'jt' || m[2] === 'juta') return Math.round(num * 1_000_000)
  if (m[2] === 'rb' || m[2] === 'ribu') return Math.round(num * 1_000)
  if (m[2] === 'k') return Math.round(num * 1_000)
  return Math.round(num)
}

async function handleSaldoSet(
  chatId: number,
  userId: string,
  accounts: Account[],
  accountQuery: string,
  amountRaw: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  // Fuzzy match account name
  const q = accountQuery.toLowerCase()
  const matched = accounts.find(
    a => a.name.toLowerCase().includes(q) || q.includes(a.name.toLowerCase())
  )
  if (!matched) {
    const names = accounts.map(a => `• ${a.name}`).join('\n')
    await telegramReply(
      chatId,
      `Akun *${accountQuery}* tidak ditemukan.\n\nAkun yang ada:\n${names}`
    )
    return
  }

  const newBalance = parseAmount(amountRaw)
  if (newBalance === null || newBalance < 0) {
    await telegramReply(chatId, `Jumlah tidak valid: \`${amountRaw}\`\nContoh: 5000000, 5jt, 500rb`)
    return
  }

  const previousBalance = matched.balance

  // Update account balance
  const { error: updateError } = await supabase
    .from('accounts')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', matched.id)
    .eq('user_id', userId)

  if (updateError) {
    console.error('Balance update error:', updateError)
    await telegramReply(chatId, 'Gagal update saldo. Coba lagi.')
    return
  }

  // Insert balance history (same as updateBalance server action)
  await supabase.from('balance_history').insert({
    account_id: matched.id,
    balance_at_time: newBalance,
    previous_balance: previousBalance,
  })

  const diff = newBalance - previousBalance
  const diffStr = diff >= 0 ? `+${formatCurrency(diff)}` : `-${formatCurrency(Math.abs(diff))}`
  await telegramReply(
    chatId,
    `✅ *Saldo ${matched.name} diperbarui!*\n` +
      `Sebelumnya: ${formatCurrency(previousBalance)}\n` +
      `Sekarang: ${formatCurrency(newBalance)}\n` +
      `Perubahan: ${diffStr}`
  )
}

async function handleTransaksi(
  chatId: number,
  userId: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const monthStart = new Date()
  monthStart.setDate(1)
  const { data: txRows } = await supabase
    .from('transactions')
    .select('description, amount, type, date, account_id')
    .eq('user_id', userId)
    .gte('date', monthStart.toISOString().slice(0, 10))
    .order('date', { ascending: false })
    .limit(15)

  if (!txRows || txRows.length === 0) {
    await telegramReply(chatId, '*📋 Transaksi Bulan Ini:*\n\nBelum ada transaksi.')
    return
  }

  const lines = txRows.map(
    t => `• ${t.date}: ${t.description} ${t.type === 'spending' ? '➖' : '➕'}${formatCurrency(t.amount)}`
  )
  await telegramReply(chatId, `*📋 Transaksi Bulan Ini:*\n${lines.join('\n')}`)
}

async function handleAkun(
  chatId: number,
  accounts: Account[],
  defaultAccountId: string | null
): Promise<void> {
  if (accounts.length === 0) {
    await telegramReply(chatId, 'Belum ada akun. Buat akun dulu di app Celengan.')
    return
  }
  const lines = accounts.map((a, i) => {
    const isDefault = a.id === defaultAccountId
    return `${i + 1}. ${a.name}${isDefault ? ' ✅ *(default)*' : ''}`
  })
  await telegramReply(
    chatId,
    `*🏦 Akun Kamu:*\n${lines.join('\n')}\n\nBalas dengan nomor akun (contoh: \`1\`) untuk set akun default.\nAkun default dipakai jika kamu tidak menyebut akun saat catat transaksi.`
  )
}

async function handleSetDefault(
  chatId: number,
  username: string,
  userId: string,
  accounts: Account[],
  input: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const num = parseInt(input.trim(), 10)
  if (isNaN(num) || num < 1 || num > accounts.length) {
    await telegramReply(chatId, `Nomor tidak valid. Kirim angka 1–${accounts.length}.`)
    return
  }
  const chosen = accounts[num - 1]
  await supabase
    .from('settings')
    .update({ telegram_default_account_id: chosen.id })
    .eq('user_id', userId)
  await telegramReply(chatId, `✅ Akun default diset ke *${chosen.name}*.`)
}

function getHelpMessage(accounts: Account[], defaultAccountId: string | null): string {
  const defaultName = accounts.find(a => a.id === defaultAccountId)?.name ?? '(belum diset)'
  return (
    `*🐷 Celengan Bot*\n\n` +
    `*Catat transaksi:*\n` +
    `• \`kopi 25rb\` — pengeluaran\n` +
    `• \`gajian 5jt\` — pemasukan\n` +
    `• \`listrik 150rb bca\` — pakai akun tertentu\n\n` +
    `*Perintah:*\n` +
    `• /saldo — lihat semua saldo\n` +
    `• /saldo BCA 5jt — update saldo akun\n` +
    `• /transaksi — transaksi bulan ini\n` +
    `• /akun — lihat & ganti akun default\n` +
    `• /bantuan — pesan ini\n\n` +
    `*Akun default sekarang:* ${defaultName}`
  )
}

function getSetupInstructions(): string {
  return (
    `Halo! Username Telegram kamu belum terdaftar di Celengan.\n\n` +
    `Buka aplikasi Celengan → Settings → Telegram Integration, lalu masukkan username Telegram kamu untuk mulai.`
  )
}

// ─── POST handler — incoming Telegram updates ─────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()

    const message = body?.message
    if (!message || !message.text) {
      return NextResponse.json({ ok: true })
    }

    const chatId: number = message.chat.id
    const username: string | undefined = message.from?.username
    const messageBody: string = message.text.trim()

    if (!username) {
      await telegramReply(chatId, getSetupInstructions())
      return NextResponse.json({ ok: true })
    }

    const supabase = createServiceClient()

    // 1. Look up user by Telegram username
    const { data: settingsRow, error: lookupError } = await supabase
      .from('settings')
      .select('user_id, telegram_default_account_id')
      .eq('telegram_username', username)
      .single()

    if (lookupError || !settingsRow) {
      await telegramReply(chatId, getSetupInstructions())
      return NextResponse.json({ ok: true })
    }

    const userId = settingsRow.user_id
    const defaultAccountId: string | null = settingsRow.telegram_default_account_id ?? null

    // 2. Fetch user's accounts
    const { data: accountRows } = await supabase
      .from('accounts')
      .select('id, name, balance, type, category')
      .eq('user_id', userId)
      .order('name')

    const accounts: Account[] = accountRows ?? []

    // 3. Handle explicit slash commands first
    const cmd = messageBody.toLowerCase().split(' ')[0]

    if (cmd === '/saldo' || cmd === '/balance') {
      // /saldo <account> <amount> → set balance
      // /saldo alone → view balances
      const parts = messageBody.split(/\s+/)
      if (parts.length >= 3) {
        const accountQuery = parts.slice(1, parts.length - 1).join(' ')
        const amountRaw = parts[parts.length - 1]
        await handleSaldoSet(chatId, userId, accounts, accountQuery, amountRaw, supabase)
      } else {
        await handleSaldo(chatId, accounts)
      }
      return NextResponse.json({ ok: true })
    }

    if (cmd === '/transaksi' || cmd === '/transactions') {
      await handleTransaksi(chatId, userId, supabase)
      return NextResponse.json({ ok: true })
    }

    if (cmd === '/akun' || cmd === '/accounts') {
      await handleAkun(chatId, accounts, defaultAccountId)
      return NextResponse.json({ ok: true })
    }

    if (cmd === '/bantuan' || cmd === '/help' || cmd === '/start') {
      await telegramReply(chatId, getHelpMessage(accounts, defaultAccountId))
      return NextResponse.json({ ok: true })
    }

    // 4. Check if user is replying with a number to set default account
    //    (bare number 1–N, no other text)
    if (/^\d+$/.test(messageBody) && accounts.length > 0) {
      await handleSetDefault(chatId, username, userId, accounts, messageBody, supabase)
      return NextResponse.json({ ok: true })
    }

    // 5. Parse as natural language transaction with Gemini
    let intent: TransactionIntent
    try {
      intent = await parseTransactionMessage(messageBody, accounts)
    } catch (err) {
      console.error('Gemini parse error:', err)
      await telegramReply(
        chatId,
        `Maaf, tidak bisa memproses pesan. Coba lagi atau ketik /bantuan.`
      )
      return NextResponse.json({ ok: true })
    }

    const lang = intent.language

    if (intent.type === 'unclear') {
      await telegramReply(
        chatId,
        lang === 'id'
          ? `Maaf, tidak mengerti. Contoh: "kopi 25rb", "gajian 5jt"\nKetik /bantuan untuk info lengkap.`
          : `Sorry, didn't understand. Example: "coffee 25000", "salary 5000000"\nType /help for more info.`
      )
      return NextResponse.json({ ok: true })
    }

    if (intent.type === 'query') {
      if (intent.query_type === 'help') {
        await telegramReply(chatId, getHelpMessage(accounts, defaultAccountId))
      } else if (intent.query_type === 'balance') {
        await handleSaldo(chatId, accounts)
      } else if (intent.query_type === 'transactions') {
        await handleTransaksi(chatId, userId, supabase)
      }
      return NextResponse.json({ ok: true })
    }

    if (intent.type === 'spending' || intent.type === 'income') {
      // 6. Resolve account: explicit mention > default > null
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

      if (!accountId && defaultAccountId) {
        accountId = defaultAccountId
      }

      // 7. Insert transaction
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
            ? 'Gagal menyimpan transaksi. Coba lagi.'
            : 'Failed to save transaction. Please try again.'
        )
        return NextResponse.json({ ok: true })
      }

      // 8. Confirmation reply
      const emoji = intent.type === 'spending' ? '💸' : '💰'
      const verb = intent.type === 'spending'
        ? lang === 'id' ? 'Pengeluaran' : 'Spending'
        : lang === 'id' ? 'Pemasukan' : 'Income'
      const acctName = accountId ? accounts.find(a => a.id === accountId)?.name ?? '' : ''
      const acctLine = acctName ? `\n🏦 Akun: ${acctName}` : '\n🏦 Akun: _(tidak ada)_'
      const catLine = intent.category ? `\n🏷 Kategori: ${intent.category}` : ''

      await telegramReply(
        chatId,
        `${emoji} *${verb} dicatat!*\n` +
          `📝 ${intent.description}\n` +
          `💵 ${formatCurrency(intent.amount)}` +
          acctLine +
          catLine +
          `\n\n_[Lihat detail di app Celengan](${process.env.NEXT_PUBLIC_APP_URL ?? 'https://celengan-teal.vercel.app'})_`
      )
      return NextResponse.json({ ok: true })
    }

    await telegramReply(chatId, `Tidak mengerti. Ketik /bantuan untuk daftar perintah.`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
