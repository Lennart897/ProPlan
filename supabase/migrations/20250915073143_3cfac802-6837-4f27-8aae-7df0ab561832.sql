-- Harden RLS for email_notifications: allow SELECT only to admin (existing) and service_role
-- Ensure RLS is enabled (no-op if already enabled)
ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;

-- Add SELECT policy for service_role so edge functions can read for dedupe checks
DROP POLICY IF EXISTS "Service role can view email notifications" ON public.email_notifications;
CREATE POLICY "Service role can view email notifications"
ON public.email_notifications
FOR SELECT
TO service_role
USING (true);

-- (Do not FORCE RLS to avoid breaking SECURITY DEFINER triggers that need to insert)
