-- Temporär vereinfachte Policy zum Debugging
DROP POLICY IF EXISTS "Allow valid status updates" ON public.manufacturing_projects;

-- Einfache Policy ohne komplexe WITH CHECK Logik
CREATE POLICY "Allow valid status updates" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (
  -- Allow if user has permission to see and update the project
  (get_user_role(auth.uid()) = 'vertrieb' AND created_by_id = auth.uid()) OR
  (get_user_role(auth.uid()) = 'supply_chain' AND status IN ('pending', 'draft', 'in_progress')) OR  
  (get_user_role(auth.uid()) = 'planung' AND status IN ('in_progress', 'pending'))
)
WITH CHECK (true); -- Temporär alles erlauben für WITH CHECK

-- Auch testen ob get_user_role funktioniert
SELECT get_user_role(auth.uid()) as current_user_role;