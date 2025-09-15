-- Add missing column used by rejection triggers to avoid 42703 errors
ALTER TABLE public.email_notifications
ADD COLUMN IF NOT EXISTS rejection_reason text;