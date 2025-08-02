-- Fix RLS policies with proper WITH CHECK expressions for UPDATE operations

-- Drop all existing update policies to start fresh
DROP POLICY IF EXISTS "Vertrieb can update their draft projects" ON public.manufacturing_projects;
DROP POLICY IF EXISTS "Supply Chain can update pending projects" ON public.manufacturing_projects;
DROP POLICY IF EXISTS "Planung can update in_progress projects" ON public.manufacturing_projects;
DROP POLICY IF EXISTS "Supply Chain can send back to draft" ON public.manufacturing_projects;
DROP POLICY IF EXISTS "Planung can send back to pending" ON public.manufacturing_projects;

-- Create comprehensive update policy for all valid status transitions
CREATE POLICY "Allow valid status updates" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (
  -- Allow if user has permission to see the project
  (get_user_role(auth.uid()) = 'vertrieb' AND created_by_id = auth.uid()) OR
  (get_user_role(auth.uid()) = 'supply_chain' AND status IN ('pending', 'draft')) OR  
  (get_user_role(auth.uid()) = 'planung' AND status = 'in_progress')
)
WITH CHECK (
  -- Allow valid transitions
  (get_user_role(auth.uid()) = 'vertrieb' AND created_by_id = auth.uid()) OR
  (get_user_role(auth.uid()) = 'supply_chain' AND status IN ('in_progress', 'rejected', 'draft')) OR
  (get_user_role(auth.uid()) = 'planung' AND status IN ('approved', 'pending'))
);