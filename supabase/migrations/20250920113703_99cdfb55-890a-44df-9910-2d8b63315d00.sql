-- Fix critical security vulnerabilities in RLS policies (final corrected version)

-- 1. Fix email_notifications table - users can only see their own notifications
DROP POLICY IF EXISTS "Service role can view email notifications" ON public.email_notifications;
DROP POLICY IF EXISTS "Service role can insert email notifications" ON public.email_notifications;

-- Replace with secure policies
CREATE POLICY "Users can view their own email notifications" 
ON public.email_notifications 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "System can insert validated email notifications" 
ON public.email_notifications 
FOR INSERT 
WITH CHECK (
  notification_type IN ('project_approval', 'project_rejection', 'planning_assignment', 'supply_chain_rejection', 'creator_rejection', 'planning_correction')
  AND user_id IS NOT NULL
);

-- 2. Fix profiles table - make it more restrictive
DROP POLICY IF EXISTS "All users can view basic profile info for project history" ON public.profiles;

CREATE POLICY "Users can view basic profile info for project context" 
ON public.profiles 
FOR SELECT 
USING (
  -- Users can see profiles of people involved in their projects
  EXISTS (
    SELECT 1 FROM public.manufacturing_projects mp
    WHERE (mp.created_by_id = auth.uid() AND mp.created_by_id = profiles.user_id)
    OR (mp.created_by_id = auth.uid() AND mp.created_by_name = profiles.user_id::text)
  )
  -- Or if they have planning/supply_chain role and project is in their domain
  OR EXISTS (
    SELECT 1 FROM public.profiles viewer
    WHERE viewer.user_id = auth.uid()
    AND (viewer.role::text = 'supply_chain' OR viewer.role::text LIKE 'planung%' OR viewer.role::text = 'admin')
  )
);

-- 3. Add validation function for email notifications
CREATE OR REPLACE FUNCTION public.validate_email_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Rate limiting: max 5 notifications per minute per user
  IF (
    SELECT COUNT(*) 
    FROM public.email_notifications 
    WHERE user_id = NEW.user_id 
    AND created_at > NOW() - INTERVAL '1 minute'
  ) > 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded for email notifications';
  END IF;
  
  -- Validate notification type
  IF NEW.notification_type NOT IN ('project_approval', 'project_rejection', 'planning_assignment', 'supply_chain_rejection', 'creator_rejection', 'planning_correction') THEN
    RAISE EXCEPTION 'Invalid notification type: %', NEW.notification_type;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for validation
DROP TRIGGER IF EXISTS validate_email_notification_trigger ON public.email_notifications;
CREATE TRIGGER validate_email_notification_trigger
  BEFORE INSERT ON public.email_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_email_notification();

-- 4. Create security audit log table
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view audit logs" 
ON public.security_audit_log 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role::text = 'admin'
  )
);

-- 5. Remove the overly permissive policies that were flagged
DROP POLICY IF EXISTS "Only system functions can insert email notifications" ON public.email_notifications;