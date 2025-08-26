-- Remove the old function and create the correct one with proper parameter handling
DROP FUNCTION IF EXISTS public.handle_planning_correction(uuid, integer, jsonb, integer);

-- Update the function to always include the rejection_reason parameter
CREATE OR REPLACE FUNCTION public.handle_planning_correction(
  p_project_id uuid, 
  p_gesamtmenge integer, 
  p_standort_verteilung jsonb, 
  p_status integer, 
  p_rejection_reason text DEFAULT NULL
)
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