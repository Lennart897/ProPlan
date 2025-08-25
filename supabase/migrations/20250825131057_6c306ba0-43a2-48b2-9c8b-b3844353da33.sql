-- Update the function to check if a project is pending for user's location
-- This ensures users only see projects where their location has a quantity > 0
CREATE OR REPLACE FUNCTION public.is_project_pending_for_user_location(user_uuid uuid, p_project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  user_location_code text;
BEGIN
  -- Get user's location code using the new function
  SELECT public.get_user_location_code(user_uuid) INTO user_location_code;
  
  -- If user has no location code, they can't see any projects
  IF user_location_code IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if there's a pending approval for this user's location
  RETURN EXISTS (
    SELECT 1 FROM public.project_location_approvals pla
    WHERE pla.project_id = p_project_id
      AND pla.location = user_location_code
      AND pla.required = true
      AND pla.approved = false
  );
END;
$function$;