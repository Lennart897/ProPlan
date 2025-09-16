-- Fix RPC failing due to empty search_path causing policies to not find get_user_role
CREATE OR REPLACE FUNCTION public.handle_planning_correction(
  p_project_id uuid,
  p_gesamtmenge integer,
  p_standort_verteilung jsonb,
  p_status integer,
  p_rejection_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Delete all location approvals for this project first (policy checks will now find get_user_role)
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
  
  -- Log for debugging
  RAISE LOG 'handle_planning_correction executed: Project %, Status %, Reason: %', 
    p_project_id, p_status, p_rejection_reason;
END;
$function$;