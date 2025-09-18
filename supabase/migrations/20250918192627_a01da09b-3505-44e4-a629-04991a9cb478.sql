-- Add email notifications preference to profiles table
ALTER TABLE public.profiles 
ADD COLUMN email_notifications_enabled boolean NOT NULL DEFAULT true;