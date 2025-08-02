-- Fix the WITH CHECK clause to properly handle status transitions
-- The issue is that WITH CHECK validates the NEW row, but we need to check current status in USING

DROP POLICY IF EXISTS "Allow valid status updates" ON public.manufacturing_projects;

-- Create a more permissive update policy that allows status changes
CREATE POLICY "Allow valid status updates" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (
  -- Allow if user has permission to see and update the project
  (get_user_role(auth.uid()) = 'vertrieb' AND created_by_id = auth.uid()) OR
  (get_user_role(auth.uid()) = 'supply_chain' AND status IN ('pending', 'draft', 'in_progress')) OR  
  (get_user_role(auth.uid()) = 'planung' AND status IN ('in_progress', 'pending'))
)
WITH CHECK (
  -- Allow valid transitions - check what the user is trying to set
  CASE 
    WHEN get_user_role(auth.uid()) = 'vertrieb' AND created_by_id = auth.uid() THEN true
    WHEN get_user_role(auth.uid()) = 'supply_chain' THEN status IN ('in_progress', 'rejected', 'draft')
    WHEN get_user_role(auth.uid()) = 'planung' THEN status IN ('approved', 'pending')
    ELSE false
  END
);