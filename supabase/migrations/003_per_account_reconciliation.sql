-- Link transactions to a specific account (nullable — existing rows get NULL)
alter table public.transactions
  add column if not exists account_id uuid
    references public.accounts(id)
    on delete set null;

-- Track the balance before each update so delta = balance_at_time - previous_balance
alter table public.balance_history
  add column if not exists previous_balance numeric not null default 0;
