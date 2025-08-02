-- Fix RLS policies for manufacturing_projects to allow proper updates

-- Drop existing update policy
DROP POLICY IF EXISTS "All roles can update projects they can see" ON public.manufacturing_projects;

-- Create separate update policies for each role and status transition
CREATE POLICY "Vertrieb can update their draft projects" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (get_user_role(auth.uid()) = 'vertrieb' AND created_by_id = auth.uid());

CREATE POLICY "Supply Chain can update pending projects" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (get_user_role(auth.uid()) = 'supply_chain' AND status = 'pending');

CREATE POLICY "Planung can update in_progress projects" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (get_user_role(auth.uid()) = 'planung' AND status = 'in_progress');

-- Also add policy to allow Supply Chain to update from any status to draft (for corrections)
CREATE POLICY "Supply Chain can send back to draft" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (get_user_role(auth.uid()) = 'supply_chain' AND status IN ('pending', 'in_progress'));

-- Allow Planung to send back to pending
CREATE POLICY "Planung can send back to pending" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (get_user_role(auth.uid()) = 'planung' AND status = 'in_progress');