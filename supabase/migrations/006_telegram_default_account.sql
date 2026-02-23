-- Add default account preference for Telegram bot
ALTER TABLE settings ADD COLUMN IF NOT EXISTS telegram_default_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
