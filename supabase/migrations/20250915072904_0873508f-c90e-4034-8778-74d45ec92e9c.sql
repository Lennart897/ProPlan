-- Fix security issue: Restrict email_notifications insert policy to system operations only
-- Remove the overly permissive INSERT policy that allows any authenticated user
DROP POLICY IF EXISTS "System can insert email notifications" ON public.email_notifications;

-- Create a more restrictive policy that only allows system operations
-- Since our database functions use SECURITY DEFINER, they will bypass RLS anyway
-- This prevents regular users from inserting fake notifications
CREATE POLICY "Only system functions can insert email notifications" 
ON public.email_notifications 
FOR INSERT 
WITH CHECK (false); -- No direct user inserts allowed

-- Ensure our system functions can still insert by adding a service role policy
-- This allows the service role (used by edge functions) to insert notifications
CREATE POLICY "Service role can insert email notifications"
ON public.email_notifications
FOR INSERT
TO service_role
WITH CHECK (true);