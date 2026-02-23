import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export type TransactionIntent =
  | {
      type: 'spending' | 'income'
      amount: number // in IDR, integer
      description: string
      category: string | null
      account_name: string | null // fuzzy match against user's accounts
      language: 'id' | 'en' // detected language of the input message
    }
  | {
      type: 'query'
      query_type: 'balance' | 'transactions' | 'help'
      language: 'id' | 'en'
    }
  | {
      type: 'unclear'
      language: 'id' | 'en'
    }

export async function parseTransactionMessage(
  message: string,
  accounts: Array<{ id: string; name: string; balance: number }>
): Promise<TransactionIntent> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const accountList = accounts
    .map(a => `- ${a.name} (balance: Rp ${a.balance.toLocaleString('id-ID')})`)
    .join('\n')

  const systemPrompt = `You are a financial assistant for a personal finance app called Celengan.
The user communicates via Telegram in Indonesian or English.

The user has these accounts:
${accountList || '(No accounts yet)'}

Parse the user's message and return ONLY valid JSON, no markdown, no explanation.

Rules:
- All amounts are in Indonesian Rupiah (IDR), integers only (no decimals)
- "jt" or "juta" means million (1jt = 1000000)
- "rb" or "ribu" means thousand (50rb = 50000)
- "k" can mean ribu (thousand)
- Spending examples: "beli kopi 25rb", "spent 50k on transport", "bayar listrik 200rb", "beli laptop 15jt"
- Income examples: "gajian 5jt", "received salary 5000000", "dapat bonus 2jt"
- Query examples: "saldo", "balance", "transaksi", "transactions", "bantuan", "help"
- If unclear, type = "unclear"
- account_name: match to closest account name from the list, or null if not mentioned
- category: infer from context (food, transport, bills, entertainment, health, shopping, utilities, etc.) or null
- language: "id" if message is primarily Indonesian, "en" if English

Return one of these JSON shapes:
{"type":"spending","amount":25000,"description":"Kopi","category":"food","account_name":null,"language":"id"}
{"type":"income","amount":5000000,"description":"Gaji","category":null,"account_name":"BCA","language":"id"}
{"type":"query","query_type":"balance","language":"id"}
{"type":"unclear","language":"id"}`

  const result = await model.generateContent([
    { text: systemPrompt },
    { text: `User message: ${message}` },
  ])

  const raw = result.response.text().trim()

  // Strip potential markdown code fences from Gemini
  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '')

  try {
    return JSON.parse(cleaned) as TransactionIntent
  } catch (e) {
    console.error('Gemini JSON parse failed. Raw response:', raw, 'Error:', e)
    return { type: 'unclear', language: 'en' }
  }
}
