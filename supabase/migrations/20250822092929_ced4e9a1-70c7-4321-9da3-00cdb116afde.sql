-- Create function to handle planning corrections atomically
CREATE OR REPLACE FUNCTION public.handle_planning_correction(
  p_project_id uuid,
  p_gesamtmenge integer,
  p_standort_verteilung jsonb,
  p_status integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
    updated_at = now()
  WHERE id = p_project_id;
END;
$$;