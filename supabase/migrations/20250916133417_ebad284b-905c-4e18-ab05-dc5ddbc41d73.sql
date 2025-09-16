-- Fix get_user_role function parameter name issue
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT role FROM public.profiles WHERE user_id = user_uuid;
$function$;

-- Also update the handle_planning_correction function to ensure it works correctly
CREATE OR REPLACE FUNCTION public.handle_planning_correction(p_project_id uuid, p_gesamtmenge integer, p_standort_verteilung jsonb, p_status integer, p_rejection_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Delete all location approvals for this project first
  DELETE FROM public.project_location_approvals 
  WHERE project_id = p_project_id;
  
  -- Update the project with new data and status
  UPDATE public.manufacturing_projects 
  SET 
    gesamtmenge = p_gesamtmenge,
    standort_verteilung = p_standort_verteilung,
    status = p_status,
    rejection_reason = p_rejection_reason,
    updated_at = now()
  WHERE id = p_project_id;
  
  -- Log the correction for debugging
  RAISE LOG 'handle_planning_correction executed: Project %, Status %, Reason: %', 
    p_project_id, p_status, p_rejection_reason;
END;
$function$;