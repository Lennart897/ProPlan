-- Function to check if a project is still pending for the user's location
CREATE OR REPLACE FUNCTION public.is_project_pending_for_user_location(user_uuid uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  role_text text;
  user_location text;
BEGIN
  SELECT public.get_user_role(user_uuid) INTO role_text;
  IF role_text LIKE 'planung_%' THEN
    user_location := substring(role_text from 'planung_(.*)');
    RETURN EXISTS (
      SELECT 1 FROM public.project_location_approvals pla
      WHERE pla.project_id = p_project_id
        AND pla.location = user_location
        AND pla.required = true
        AND pla.approved = false
    );
  ELSE
    RETURN false;
  END IF;
END;
$function$;

-- Update Planning visibility policy to hide projects after location approval is done
DROP POLICY IF EXISTS "Planning sees in_progress for their locations" ON public.manufacturing_projects;

CREATE POLICY "Planning sees in_progress for their locations"
ON public.manufacturing_projects
FOR SELECT
USING (
  (
    public.get_user_role(auth.uid()) = 'planung' AND status = 'in_progress'
  )
  OR (
    public.get_user_role(auth.uid()) LIKE 'planung_%'
    AND status = 'in_progress'
    AND public.is_project_pending_for_user_location(auth.uid(), id)
  )
);
