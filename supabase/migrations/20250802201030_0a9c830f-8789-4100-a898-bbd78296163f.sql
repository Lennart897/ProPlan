-- RLS wieder aktivieren für Sicherheit
ALTER TABLE public.manufacturing_projects ENABLE ROW LEVEL SECURITY;

-- Alle bestehenden Policies löschen
DROP POLICY IF EXISTS "Allow valid status updates" ON public.manufacturing_projects;
DROP POLICY IF EXISTS "Planung can view in_progress projects" ON public.manufacturing_projects;
DROP POLICY IF EXISTS "Supply Chain can view pending projects" ON public.manufacturing_projects;
DROP POLICY IF EXISTS "Vertrieb can create projects" ON public.manufacturing_projects;
DROP POLICY IF EXISTS "Vertrieb can view all projects" ON public.manufacturing_projects;

-- Neue, vereinfachte Policies die direkt mit JWT arbeiten
CREATE POLICY "Authenticated users can view projects" 
ON public.manufacturing_projects 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create projects" 
ON public.manufacturing_projects 
FOR INSERT 
TO authenticated
WITH CHECK (created_by_id = auth.uid());

CREATE POLICY "Authenticated users can update projects" 
ON public.manufacturing_projects 
FOR UPDATE 
TO authenticated
USING (true)
WITH CHECK (true);