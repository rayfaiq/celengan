-- Add telegram_username to settings, replacing whatsapp_phone
ALTER TABLE settings ADD COLUMN IF NOT EXISTS telegram_username TEXT;

-- Unique index: one account per Telegram username (nulls are allowed to repeat)
CREATE UNIQUE INDEX IF NOT EXISTS settings_telegram_username_unique
  ON settings (telegram_username)
  WHERE telegram_username IS NOT NULL;
