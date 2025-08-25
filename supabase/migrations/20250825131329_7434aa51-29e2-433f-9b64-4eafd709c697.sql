-- Update the function that creates location approvals to use location codes
CREATE OR REPLACE FUNCTION public.create_location_approvals_for_project(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  dist jsonb;
  k text;
  v text;
  location_code text;
BEGIN
  SELECT standort_verteilung INTO dist FROM public.manufacturing_projects WHERE id = p_project_id;
  IF dist IS NULL THEN
    RETURN;
  END IF;

  FOR k, v IN SELECT * FROM jsonb_each_text(dist)
  LOOP
    IF v::numeric > 0 THEN
      -- Try to find the location code for this location name
      SELECT code INTO location_code FROM public.locations WHERE name = k AND active = true;
      
      -- If we found a matching location, use its code; otherwise use the original key
      INSERT INTO public.project_location_approvals (project_id, location, required)
      VALUES (p_project_id, COALESCE(location_code, k), true)
      ON CONFLICT (project_id, location) DO NOTHING;
    END IF;
  END LOOP;
END;
$function$;