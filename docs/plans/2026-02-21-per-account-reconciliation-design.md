# Per-Account Balance Reconciliation Design

**Date:** 2026-02-21
**Status:** Approved

## Problem

The current app tracks a global "unaccounted" spending delta across all accounts combined. When a user updates BCA from 10k to 9k, the app knows 1k is unaccounted globally — but there's no way to know which account the delta belongs to, and no structured way to log what that 1k was spent on per account.

## Goal

Each account tracks its own unaccounted delta between balance updates. Users can log transactions linked to a specific account to "explain" the delta. The app shows per-account reconciliation status passively (badge/banner), so users can fill in details at their own pace.

---

## Data Model Changes

### Migration 003

```sql
-- Link transactions to a specific account (nullable for backward compat)
alter table public.transactions
  add column account_id uuid references public.accounts(id) on delete set null;

-- Store previous balance in each snapshot for easy delta calculation
alter table public.balance_history
  add column previous_balance numeric not null default 0;
```

**Why `previous_balance` on balance_history?**
Instead of joining to the prior row to compute delta, each snapshot carries its own "before" value. This makes per-account delta calculation O(1) per account instead of requiring a window function.

---

## Per-Account Delta Calculation

When `updateBalance(accountId, newBalance)` is called:
1. Read the account's current balance as `previousBalance`
2. Insert `balance_history` row with both `balance = newBalance` and `previous_balance = previousBalance`

For display, per-account unaccounted delta:

```
lastSnapshot = most recent balance_history row for account
rawDelta = lastSnapshot.balance - lastSnapshot.previous_balance
// negative = spending, positive = income

snapshotStart = created_at of the snapshot BEFORE lastSnapshot (or account created_at)
linkedTransactions = transactions WHERE account_id = account.id
                     AND date >= snapshotStart AND date <= lastSnapshot.created_at
linkedNet = sum(income amounts) - sum(spending amounts)

unaccountedDelta = rawDelta - linkedNet
// if unaccountedDelta != 0 → account needs reconciliation
```

The global dashboard delta becomes the sum of all per-account unaccounted deltas.

---

## UI Changes

### 1. Account Cards (Dashboard)
- If `unaccountedDelta != 0`, show a warning badge: `⚠ -1,000 unaccounted`
- Clicking the badge navigates to `/transactions?account=<id>&unreconciled=true`

### 2. Transaction Form
- Add optional **Account** dropdown (account name list)
- Pre-selected when opening from an account's unaccounted badge
- Existing transactions with no account_id remain global (backward compatible)

### 3. Transactions Page
- Add **Account** filter dropdown (All / BCA / Mandiri / etc.)
- When filtered by account, the Expense Delta card shows per-account delta:
  - "BCA: -1,000 unaccounted since Jan 15 update"
  - Green if fully reconciled

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/003_per_account_reconciliation.sql` | New migration (account_id on transactions, previous_balance on balance_history) |
| `app/actions/accounts.ts` | `updateBalance()` — save `previous_balance` in snapshot |
| `lib/calculations.ts` | Add `calcPerAccountDelta()` function |
| `app/(app)/dashboard/page.tsx` | Fetch per-account deltas, pass to account cards |
| `components/AccountCard.tsx` | Show unaccounted badge (new component or update existing) |
| `app/(app)/transactions/page.tsx` | Accept `account` query param, filter transactions |
| `app/(app)/transactions/TransactionsClient.tsx` | Add account filter dropdown + account field in transaction form |
| `app/actions/transactions.ts` | Accept `account_id` in `createTransaction()` |

---

## Verification

1. Create two accounts (BCA, Mandiri)
2. Update BCA balance from 10k → 9k — dashboard should show "BCA: -1,000 unaccounted"
3. Navigate to transactions, filter by BCA, add a 600 spending transaction linked to BCA
4. Dashboard should now show "BCA: -400 unaccounted"
5. Add another 400 spending transaction linked to BCA
6. Badge disappears — BCA is fully reconciled
7. Mandiri shows no badge (no balance change)
8. Test income: update BCA from 9k → 11k — should show "BCA: +2,000 unaccounted (income)"
9. Log 2k income transaction linked to BCA — badge clears
