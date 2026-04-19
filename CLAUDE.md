# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Celengan is a "Balance-First" personal finance tracker built with Next.js (App Router) and Supabase. It tracks account balances, calculates net worth, infers unaccounted expenses via delta analysis, suggests 80/20 Core/Satellite portfolio rebalancing, and monitors a marriage fund goal. Supports Indonesian (default) and English.

## Commands

```bash
npm run dev      # Start dev server with hot reload
npm run build    # Production build (TypeScript compilation + Next.js)
npm run start    # Serve production build
npm run lint     # ESLint
```

No automated test suite exists — testing is manual.

## Architecture

### Routing & Rendering

- **Next.js App Router** with two route groups:
  - `app/(auth)/` — login page (public)
  - `app/(app)/` — dashboard, accounts, transactions, history, settings (protected)
- **Server Components** fetch data from Supabase; **Client Components** handle interactivity (forms, dialogs, charts)
- **Server Actions** in `app/actions/` handle all mutations (accounts, transactions, settings) with RLS user_id checks and demo-user write guards
- **Middleware** (`middleware.ts`) enforces auth: unauthenticated → `/login`, authenticated on `/login` → `/dashboard`

### Key Directories

- `lib/calculations.ts` — Pure business logic: net worth, expense delta, rebalancing suggestion, goal progress, IDR formatting, amount parsing ("5jt" = 5M, "50k" = 50K)
- `lib/translations.ts` + `lib/language-context.tsx` — i18n with `useLanguage()` hook, all UI strings in `translations` object
- `lib/supabase/` — Three client variants: `client.ts` (browser), `server.ts` (server components/actions with cookies), `service.ts` (service role for admin ops)
- `lib/gemini.ts` — Gemini 2.5-flash NLP for transaction parsing from Telegram messages, with regex fallback
- `components/ui/` — shadcn/ui primitives (New York style, dark-mode only)
- `components/` — Feature components: NetWorthChart, RebalancingSuggester, MarriageFundGoal, ExpenseDelta, ExportCSV, AmountInput
- `supabase/migrations/` — Sequential SQL migrations (001–009)

### Database (Supabase PostgreSQL)

Four main tables, all RLS-enabled (`auth.uid() = user_id`):
- **settings** — per-user config (monthly_income, goal_target, goal_target_date)
- **accounts** — financial accounts with type (cash/investment), category (core/satellite), balance_mode (manual/auto)
- **balance_history** — snapshots linked to accounts (cascade delete), stores balance_at_time + previous_balance
- **transactions** — income/spending entries, optionally linked to an account (auto-mode triggers balance update + history creation)

### Patterns to Follow

- Mutations go through Server Actions, not API routes (except bot webhooks in `app/api/`)
- All Server Actions must check `isDemoUser()` before writes
- All Server Actions must verify `user_id` matches the authenticated user
- Use `revalidatePath()` after mutations for automatic UI refresh
- Amounts are stored as `bigint` (IDR, no decimals) — use `formatIDR()` from `lib/calculations.ts` for display
- Account types: `cash | investment`; categories: `core | satellite` — these drive the 80/20 rebalancing logic
- The `@/*` path alias maps to the project root

### Styling

- Dark-mode only (HTML root `class="dark"`)
- Tailwind CSS 4 with shadcn/ui (New York variant)
- Accent colors: emerald (primary), red (destructive), amber (warning)
- Responsive: desktop sidebar + mobile bottom nav (breakpoint: `md`)

### External Integrations

- **Telegram Bot** (`app/api/telegram/route.ts`) — webhook processes messages via Gemini NLP, creates transactions/updates balances
- **Supabase Auth** — email/password with email confirmation
- **Vercel** — deployment target
