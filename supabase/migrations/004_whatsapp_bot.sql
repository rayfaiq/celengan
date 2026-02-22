-- Add WhatsApp phone number to settings table
alter table public.settings
  add column if not exists whatsapp_phone text;

-- Partial unique index: only enforce uniqueness when phone is not null
-- (Multiple users with null phone is fine, only one user per phone number)
create unique index if not exists settings_whatsapp_phone_unique
  on public.settings (whatsapp_phone)
  where whatsapp_phone is not null;
