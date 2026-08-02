-- Gmail send-as-Reply-To preference columns for Google OAuth clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS gmail_send_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gmail_reply_to       TEXT;
