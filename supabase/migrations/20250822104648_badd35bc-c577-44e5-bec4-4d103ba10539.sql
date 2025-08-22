-- Add RLS policy to allow Vertrieb to update projects in status 2 (Prüfung Vertrieb)
CREATE POLICY "Vertrieb can update projects in status 2" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (get_user_role(auth.uid()) = 'vertrieb' AND status = 2)
WITH CHECK (get_user_role(auth.uid()) = 'vertrieb' AND status = 2);