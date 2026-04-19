# Budget Feature Design

## Overview

A monthly "free spending" budget that lets users set aside a fixed amount each month and track spending against it. Unspent budget rolls over to the next month. Budget transactions are tagged via a flag on existing transactions — no new tables.

## Database Changes

### `settings` table
- Add column: `monthly_budget bigint default 0`

### `transactions` table
- Add column: `is_budget boolean default false`

Migration: `supabase/migrations/010_add_budget.sql`

## Budget Calculation Logic

Added to `lib/calculations.ts`:

```
totalBudgetSpent(month) = SUM(amount) WHERE is_budget=true AND type='spending' AND date in month
rollover = SUM over all past months of (monthly_budget - budgetSpentThatMonth)
currentMonthBudget = settings.monthly_budget + rollover
remaining = currentMonthBudget - totalBudgetSpentThisMonth
```

Rollover is computed by scanning all historical budget transactions grouped by month. For a personal finance app with a few users, this is negligible.

## UI — Dashboard Card

A card on the dashboard showing:
- Budget remaining: e.g. "Rp 1.600.000 / Rp 2.000.000"
- Progress bar (green → yellow at 50% → red at 80% spent)
- Rollover line if applicable: "+Rp 400.000 from previous months"
- Links to /budget page

## UI — /budget Page

New page at `app/(app)/budget/`. Contains:
- Current month budget summary (remaining, spent, rollover, progress bar)
- Monthly budget amount setting (inline editable, saves to settings.monthly_budget)
- List of budget transactions for the current month (description, amount, account, date)
- Ability to create a new budget transaction from the web (reuses transaction form with is_budget=true)
- Month selector to browse past months
- Sidebar entry for "Budget" between existing nav items

## Telegram Bot — `/spent` Command

Format: `/spent <amount> from <account> for <description>`

Parsing rules:
- Amount: required, supports jt/rb/k suffixes (same as existing parser)
- `from <account>`: optional, fuzzy-matches account name. Falls back to user's default account if omitted.
- `for <description>`: optional, defaults to "Budget spending" if omitted.

Behavior:
- Creates a transaction with `is_budget: true`, `type: 'spending'`
- If target account is auto-mode, updates balance + creates balance_history snapshot
- Replies with confirmation: "Budget spent: Rp 400.000 from Mandiri for buy games. Remaining: Rp 1.600.000/Rp 2.000.000"

Uses regex parsing (no Gemini needed) since the format is structured.

## Server Actions

- Extend `upsertSettings` to accept `monthly_budget`
- Extend `createTransaction` to accept `is_budget` parameter
- New function `getBudgetSummary(userId)` — returns { monthlyBudget, spentThisMonth, rollover, remaining, transactions[] }

## i18n

Add translations for all budget-related strings (budget, remaining, spent, rollover, etc.) in both Indonesian and English in `lib/translations.ts`.

## Demo User

Budget page and dashboard card are read-only for demo users (existing pattern with DemoModal).
