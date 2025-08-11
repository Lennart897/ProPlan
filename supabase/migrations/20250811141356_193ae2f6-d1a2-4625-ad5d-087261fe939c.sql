-- Create table to track per-location approvals
CREATE TABLE public.project_location_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.manufacturing_projects(id) ON DELETE CASCADE,
  location text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_at timestamptz,
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, location)
);

-- Enable RLS
ALTER TABLE public.project_location_approvals ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view approvals for projects they can see
CREATE POLICY "Users can view approvals for projects they can see"
ON public.project_location_approvals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.manufacturing_projects mp
    WHERE mp.id = project_id
  )
);

-- Only Supply Chain can create approval rows
CREATE POLICY "Supply Chain can create approvals"
ON public.project_location_approvals
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role(auth.uid()) = 'supply_chain'
);

-- Planning can approve only for their location (or legacy 'planung' can update any)
CREATE POLICY "Planning can approve for their location"
ON public.project_location_approvals
FOR UPDATE
TO authenticated
USING (
  (public.get_user_role(auth.uid()) LIKE 'planung_%' AND substring(public.get_user_role(auth.uid()) from 'planung_(.*)') = location)
  OR public.get_user_role(auth.uid()) = 'planung'
)
WITH CHECK (
  (public.get_user_role(auth.uid()) LIKE 'planung_%' AND substring(public.get_user_role(auth.uid()) from 'planung_(.*)') = location)
  OR public.get_user_role(auth.uid()) = 'planung'
);

-- updated_at trigger
CREATE TRIGGER update_project_location_approvals_updated_at
BEFORE UPDATE ON public.project_location_approvals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to refresh project status from approvals
CREATE OR REPLACE FUNCTION public.refresh_project_status_from_approvals(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  unapproved_count int;
BEGIN
  SELECT count(*) INTO unapproved_count
  FROM public.project_location_approvals
  WHERE project_id = p_project_id
    AND required = true
    AND approved = false;

  IF unapproved_count = 0 THEN
    UPDATE public.manufacturing_projects
    SET status = 'approved'
    WHERE id = p_project_id;
  ELSE
    UPDATE public.manufacturing_projects
    SET status = 'in_progress'
    WHERE id = p_project_id;
  END IF;
END;
$$;

-- Trigger function to refresh status after approvals change
CREATE OR REPLACE FUNCTION public.trg_refresh_project_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  pid uuid;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  PERFORM public.refresh_project_status_from_approvals(pid);
  RETURN NULL;
END;
$$;

-- Attach trigger to approvals table
CREATE TRIGGER t_after_change_refresh_status
AFTER INSERT OR UPDATE OR DELETE ON public.project_location_approvals
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_project_status();

-- Function to create approval rows based on standort_verteilung
CREATE OR REPLACE FUNCTION public.create_location_approvals_for_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  dist jsonb;
  k text;
  v text;
BEGIN
  SELECT standort_verteilung INTO dist FROM public.manufacturing_projects WHERE id = p_project_id;
  IF dist IS NULL THEN
    RETURN;
  END IF;

  FOR k, v IN SELECT * FROM jsonb_each_text(dist)
  LOOP
    IF v::numeric > 0 THEN
      INSERT INTO public.project_location_approvals (project_id, location, required)
      VALUES (p_project_id, k, true)
      ON CONFLICT (project_id, location) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Trigger: when a project moves to in_progress, create approval rows
CREATE OR REPLACE FUNCTION public.trg_on_project_status_to_in_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.create_location_approvals_for_project(NEW.id);
    -- Ensure status reflects current approvals state
    PERFORM public.refresh_project_status_from_approvals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER t_on_project_status_to_in_progress
AFTER UPDATE ON public.manufacturing_projects
FOR EACH ROW EXECUTE FUNCTION public.trg_on_project_status_to_in_progress();