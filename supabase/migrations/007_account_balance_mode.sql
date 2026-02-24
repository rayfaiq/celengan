-- Add per-account balance mode: 'manual' (default, current behavior) or 'auto'
-- Auto mode: when a transaction is created/deleted for this account,
-- accounts.balance is adjusted automatically and a balance_history snapshot is inserted.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS balance_mode TEXT
    NOT NULL DEFAULT 'manual'
    CHECK (balance_mode IN ('manual', 'auto'));
