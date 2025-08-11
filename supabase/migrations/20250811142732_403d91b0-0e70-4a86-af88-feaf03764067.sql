-- Restrict project visibility according to role and affected locations
-- 1) Remove overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.manufacturing_projects;

-- 2) Admins can view all projects
CREATE POLICY "Admins can view all projects"
ON public.manufacturing_projects
FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

-- 3) Supply Chain can view all projects
CREATE POLICY "Supply Chain can view all projects"
ON public.manufacturing_projects
FOR SELECT
USING (public.get_user_role(auth.uid()) = 'supply_chain');

-- 4) Planning can view only in_progress projects for their locations
CREATE POLICY "Planning sees in_progress for their locations"
ON public.manufacturing_projects
FOR SELECT
USING (
  (
    public.get_user_role(auth.uid()) = 'planung' AND status = 'in_progress'
  )
  OR (
    public.get_user_role(auth.uid()) LIKE 'planung_%' AND status = 'in_progress'
    AND substring(public.get_user_role(auth.uid()), 'planung_(.*)') = ANY(public.get_affected_locations(standort_verteilung))
  )
);
