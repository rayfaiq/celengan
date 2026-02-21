-- Settings (1 row per user)
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  monthly_income bigint not null default 20000000,
  goal_target bigint not null default 100000000,
  goal_target_date date not null default '2027-11-01',
  created_at timestamptz default now()
);
alter table public.settings enable row level security;
create policy "Users own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Accounts
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  type text check (type in ('cash', 'investment')) not null,
  category text check (category in ('core', 'satellite')) not null,
  balance bigint not null default 0,
  updated_at timestamptz default now()
);
alter table public.accounts enable row level security;
create policy "Users own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Balance history snapshots
create table if not exists public.balance_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade not null,
  balance_at_time bigint not null,
  recorded_at timestamptz default now()
);
alter table public.balance_history enable row level security;
create policy "Users own balance_history" on public.balance_history
  for all using (
    exists (
      select 1 from public.accounts
      where accounts.id = balance_history.account_id
        and accounts.user_id = auth.uid()
    )
  );

-- Transactions (optional expense detailing)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  description text not null,
  amount bigint not null,
  category text,
  date date not null default current_date
);
alter table public.transactions enable row level security;
create policy "Users own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
