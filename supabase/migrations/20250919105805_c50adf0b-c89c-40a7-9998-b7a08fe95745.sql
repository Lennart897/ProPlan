-- Provide minimal project metadata for a user's own activity history
CREATE OR REPLACE FUNCTION public.get_projects_minimal_for_user_history(
  p_user uuid,
  p_project_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  project_number bigint,
  customer text,
  artikel_nummer text,
  artikel_bezeichnung text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT mp.id, mp.project_number, mp.customer, mp.artikel_nummer, mp.artikel_bezeichnung
  FROM public.manufacturing_projects mp
  WHERE mp.id = ANY(p_project_ids)
    AND EXISTS (
      SELECT 1 FROM public.project_history ph
      WHERE ph.project_id = mp.id
        AND ph.user_id = p_user
    );
$$;