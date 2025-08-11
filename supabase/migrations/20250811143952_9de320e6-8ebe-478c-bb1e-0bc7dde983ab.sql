-- Allow Sales (Vertrieb) to view all projects
CREATE POLICY "Sales can view all projects"
ON public.manufacturing_projects
FOR SELECT
USING (public.get_user_role(auth.uid()) = 'vertrieb');
