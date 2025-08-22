-- Drop the existing policy and create a corrected one
DROP POLICY "Vertrieb can update projects in status 2" ON public.manufacturing_projects;

-- Create corrected policy that allows Vertrieb to update projects from status 2 to status 4
CREATE POLICY "Vertrieb can update projects from status 2" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (get_user_role(auth.uid()) = 'vertrieb' AND status = 2)
WITH CHECK (get_user_role(auth.uid()) = 'vertrieb' AND (status = 2 OR status = 4));