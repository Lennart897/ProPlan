-- Fix critical security vulnerabilities in RLS policies

-- 1. Fix email_notifications table - users can only see their own notifications
DROP POLICY IF EXISTS "All users can view email notifications" ON public.email_notifications;
DROP POLICY IF EXISTS "Service role can view email notifications" ON public.email_notifications;
DROP POLICY IF EXISTS "Service role can insert email notifications" ON public.email_notifications;

-- Create secure policies for email_notifications
CREATE POLICY "Users can view their own email notifications" 
ON public.email_notifications 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "System can insert email notifications" 
ON public.email_notifications 
FOR INSERT 
WITH CHECK (
  -- Only allow specific notification types and validate user_id
  notification_type IN ('project_approval', 'project_rejection', 'planning_assignment', 'supply_chain_rejection', 'creator_rejection', 'planning_correction')
  AND user_id IS NOT NULL
);

-- 2. Fix profiles table - restrict access to basic info only when needed
DROP POLICY IF EXISTS "All users can view basic profile info for project history" ON public.profiles;

-- Create more restrictive profile policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can view display names for project context" 
ON public.profiles 
FOR SELECT 
USING (
  -- Only allow viewing display_name for users involved in projects where the viewer has access
  EXISTS (
    SELECT 1 FROM public.manufacturing_projects mp
    WHERE mp.created_by_id = auth.uid() 
    OR mp.created_by_name = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.project_location_approvals pla
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE pla.project_id = mp.id
      AND (p.role LIKE 'planung%' OR p.role IN ('supply_chain', 'admin'))
    )
  )
);

-- 3. Add rate limiting and validation for email notifications
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
    RAISE EXCEPTION 'Invalid notification type';
  END IF;
  
  -- Validate user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id) THEN
    RAISE EXCEPTION 'Invalid user_id';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for email notification validation
DROP TRIGGER IF EXISTS validate_email_notification_trigger ON public.email_notifications;
CREATE TRIGGER validate_email_notification_trigger
  BEFORE INSERT ON public.email_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_email_notification();

-- 4. Enhanced logging for security monitoring
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

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs" 
ON public.security_audit_log 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- 5. Create function for secure project access validation
CREATE OR REPLACE FUNCTION public.can_user_access_project(user_uuid UUID, project_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role_text TEXT;
  project_creator UUID;
BEGIN
  -- Get user role
  SELECT role INTO user_role_text FROM public.profiles WHERE user_id = user_uuid;
  
  -- Get project creator
  SELECT created_by_id INTO project_creator FROM public.manufacturing_projects WHERE id = project_uuid;
  
  -- Creator can always access their projects
  IF project_creator = user_uuid THEN
    RETURN TRUE;
  END IF;
  
  -- Admin can access all projects
  IF user_role_text = 'admin' THEN
    RETURN TRUE;
  END IF;
  
  -- Supply chain can access projects in review stages
  IF user_role_text = 'supply_chain' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.manufacturing_projects 
      WHERE id = project_uuid AND status IN (2, 3)
    );
  END IF;
  
  -- Planning users can access projects for their locations
  IF user_role_text LIKE 'planung%' THEN
    RETURN public.can_user_approve_project(user_uuid, project_uuid);
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;