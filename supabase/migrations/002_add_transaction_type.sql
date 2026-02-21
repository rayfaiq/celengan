alter table public.transactions
  add column if not exists type text
    not null
    default 'spending'
    check (type in ('spending', 'income'));
