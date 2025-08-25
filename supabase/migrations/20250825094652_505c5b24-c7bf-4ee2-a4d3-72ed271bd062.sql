-- Fix duplicate approval emails by preventing redundant status updates
CREATE OR REPLACE FUNCTION public.refresh_project_status_from_approvals(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  unapproved_count int;
  current_status int;
BEGIN
  -- Get current project status
  SELECT status INTO current_status
  FROM public.manufacturing_projects
  WHERE id = p_project_id;

  SELECT count(*) INTO unapproved_count
  FROM public.project_location_approvals
  WHERE project_id = p_project_id
    AND required = true
    AND approved = false;

  IF unapproved_count = 0 AND current_status != 5 THEN
    -- Only update to status 5 if not already approved
    UPDATE public.manufacturing_projects
    SET status = 5  -- approved
    WHERE id = p_project_id;
  ELSIF unapproved_count > 0 AND current_status != 4 THEN
    -- Only update to status 4 if not already in progress
    UPDATE public.manufacturing_projects
    SET status = 4  -- in_progress
    WHERE id = p_project_id;
  END IF;
END;
$function$