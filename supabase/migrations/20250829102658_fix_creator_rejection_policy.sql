-- Fix creator rejection policy to ensure project creators can always reject approved projects
-- This migration ensures that the creator rejection functionality works correctly

-- First, ensure the can_creator_reject_approved_project function exists and works correctly
CREATE OR REPLACE FUNCTION public.can_creator_reject_approved_project(user_uuid uuid, project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
DECLARE
  project_creator uuid;
  project_status int;
BEGIN
  -- Get project creator and status
  SELECT created_by_id, status INTO project_creator, project_status
  FROM public.manufacturing_projects
  WHERE id = project_id;
  
  -- Check if user is creator and project is approved (status 5)
  -- Add logging for debugging
  RAISE LOG 'can_creator_reject_approved_project: user_uuid=%, project_id=%, project_creator=%, project_status=%, result=%',
    user_uuid, project_id, project_creator, project_status, (project_creator = user_uuid AND project_status = 5);
  
  RETURN (project_creator = user_uuid AND project_status = 5);
END;
$$;

-- Ensure the RLS policy for creator updates exists and is correct
DROP POLICY IF EXISTS "Creators can update their own projects" ON public.manufacturing_projects;

CREATE POLICY "Creators can update their own projects" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (
  -- Allow creators to update their own projects
  (created_by_id = auth.uid()) OR 
  -- Allow creators to reject approved projects
  can_creator_reject_approved_project(auth.uid(), id)
)
WITH CHECK (
  -- Allow creators to update their own projects
  (created_by_id = auth.uid()) OR 
  -- Allow creators to reject approved projects
  can_creator_reject_approved_project(auth.uid(), id)
);

-- Add a specific policy for creator rejection of approved projects for extra clarity
CREATE POLICY "Creators can reject approved projects" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (
  created_by_id = auth.uid() AND status = 5  -- GENEHMIGT
)
WITH CHECK (
  created_by_id = auth.uid() AND (
    NEW.status = 6 OR  -- ABGELEHNT - allow rejection
    NEW.status = status  -- Allow other updates that don't change status
  )
);

-- Ensure rejection_reason column exists
ALTER TABLE public.manufacturing_projects 
ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Add logging to help debug creator rejection issues
COMMENT ON POLICY "Creators can update their own projects" ON public.manufacturing_projects IS 
'Allows project creators to update their own projects and reject approved projects';

COMMENT ON POLICY "Creators can reject approved projects" ON public.manufacturing_projects IS 
'Explicit policy allowing creators to reject their approved projects (status 5 to 6)';