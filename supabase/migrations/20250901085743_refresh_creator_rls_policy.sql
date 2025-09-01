-- Refresh RLS policy to ensure consistency with updated can_creator_reject_approved_project function
-- The function was updated in 20250901082405 to allow cancellation in any status except 6 and 7,
-- but the RLS policy hasn't been refreshed since then, which could cause inconsistent behavior.

DROP POLICY IF EXISTS "Creators can update their own projects" ON public.manufacturing_projects;

CREATE POLICY "Creators can update their own projects" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (
  (created_by_id = auth.uid()) OR 
  can_creator_reject_approved_project(auth.uid(), id)
)
WITH CHECK (
  (created_by_id = auth.uid()) OR 
  can_creator_reject_approved_project(auth.uid(), id)
);