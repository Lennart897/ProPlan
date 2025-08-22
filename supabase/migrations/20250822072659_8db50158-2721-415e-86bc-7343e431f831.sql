-- First, add the new columns
ALTER TABLE public.manufacturing_projects 
ADD COLUMN status_new INTEGER NOT NULL DEFAULT 3,
ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE NULL;

-- Migrate existing status values
UPDATE public.manufacturing_projects SET status_new = 
  CASE 
    WHEN status = 'draft' THEN 1
    WHEN status = 'pending' THEN 3  
    WHEN status = 'in_progress' THEN 4
    WHEN status = 'approved' THEN 5
    WHEN status = 'rejected' THEN 6
    WHEN status = 'archived' THEN 7
    ELSE 1
  END;

-- Drop dependent policies and triggers temporarily
DROP POLICY IF EXISTS "Planning sees in_progress for their locations" ON public.manufacturing_projects;
DROP TRIGGER IF EXISTS project_approval_trigger ON public.manufacturing_projects;
DROP TRIGGER IF EXISTS project_insert_trigger ON public.manufacturing_projects;
DROP TRIGGER IF EXISTS project_planning_trigger ON public.manufacturing_projects;

-- Now drop the old status column and rename the new one
ALTER TABLE public.manufacturing_projects DROP COLUMN status;
ALTER TABLE public.manufacturing_projects RENAME COLUMN status_new TO status;

-- Recreate the RLS policy with numeric status values
CREATE POLICY "Planning sees in_progress for their locations" ON public.manufacturing_projects
FOR SELECT USING (
  ((get_user_role(auth.uid()) = 'planung'::text) AND (status = 4)) OR 
  ((get_user_role(auth.uid()) ~~ 'planung_%'::text) AND (status = 4) AND is_project_pending_for_user_location(auth.uid(), id))
);

-- Recreate triggers with updated functions
CREATE TRIGGER project_approval_trigger
AFTER UPDATE ON public.manufacturing_projects
FOR EACH ROW
WHEN (NEW.status = 5 AND OLD.status != 5)
EXECUTE FUNCTION public.notify_project_approval();

CREATE TRIGGER project_planning_trigger
AFTER UPDATE ON public.manufacturing_projects
FOR EACH ROW
WHEN (NEW.status = 4 AND (OLD.status IS DISTINCT FROM NEW.status))
EXECUTE FUNCTION public.notify_planning_assignment();

CREATE TRIGGER project_insert_trigger
AFTER INSERT ON public.manufacturing_projects
FOR EACH ROW
EXECUTE FUNCTION public.notify_project_insert();

-- Update functions to work with numeric status
CREATE OR REPLACE FUNCTION public.trg_on_project_status_to_in_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 4 AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.create_location_approvals_for_project(NEW.id);
    PERFORM public.refresh_project_status_from_approvals(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_project_status_from_approvals(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  unapproved_count int;
BEGIN
  SELECT count(*) INTO unapproved_count
  FROM public.project_location_approvals
  WHERE project_id = p_project_id
    AND required = true
    AND approved = false;

  IF unapproved_count = 0 THEN
    UPDATE public.manufacturing_projects
    SET status = 5  -- approved
    WHERE id = p_project_id;
  ELSE
    UPDATE public.manufacturing_projects
    SET status = 4  -- in_progress
    WHERE id = p_project_id;
  END IF;
END;
$function$;

-- Create indexes for better performance
CREATE INDEX idx_manufacturing_projects_archived ON public.manufacturing_projects(archived, status);
CREATE INDEX idx_manufacturing_projects_archived_at ON public.manufacturing_projects(archived_at) WHERE archived_at IS NOT NULL;