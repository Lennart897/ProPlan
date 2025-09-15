-- Allow project creators to cancel their projects in status 3, 4, or 5
-- Update the function to allow cancellation in these statuses

CREATE OR REPLACE FUNCTION public.can_creator_reject_approved_project(user_uuid uuid, project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  project_creator_id uuid;
  project_creator_name text;
  project_status int;
  current_user_uuid_text text;
BEGIN
  -- Get project creator, creator name and status
  SELECT created_by_id, created_by_name, status 
  INTO project_creator_id, project_creator_name, project_status
  FROM public.manufacturing_projects
  WHERE id = project_id;
  
  -- Convert user UUID to text for comparison with created_by_name field
  current_user_uuid_text := user_uuid::text;
  
  -- Check if user is creator (either by UUID or string) - allow cancellation in status 3, 4, 5 (and any other status except cancelled (6) or completed (7))
  RETURN (
    (project_creator_id = user_uuid OR project_creator_name = current_user_uuid_text) 
    AND project_status IN (3, 4, 5) -- Allow cancellation specifically in these statuses: SupplyChain review, Planning review, Approved
  );
END;
$function$;