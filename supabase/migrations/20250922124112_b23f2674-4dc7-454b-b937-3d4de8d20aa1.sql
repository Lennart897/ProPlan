-- Fix infinite recursion in profiles RLS policies
-- Drop the problematic policy that causes recursion
DROP POLICY IF EXISTS "Users can view basic profile info for project context" ON public.profiles;

-- Create a simpler policy that allows users to see profiles for project history context
-- This policy allows viewing profiles when there are project history entries involving both users
CREATE POLICY "Users can view profiles for project history context"
ON public.profiles
FOR SELECT
USING (
  -- Users can always see their own profile
  auth.uid() = user_id
  OR
  -- Users can see profiles of other users who appear in project history for projects they're involved in
  EXISTS (
    SELECT 1 FROM public.project_history ph1
    WHERE ph1.user_id = profiles.user_id
      AND EXISTS (
        SELECT 1 FROM public.project_history ph2  
        WHERE ph2.project_id = ph1.project_id
          AND ph2.user_id = auth.uid()
      )
  )
  OR
  -- Supply chain, planning, and admin users can see all profiles (using direct role check)
  EXISTS (
    SELECT 1 FROM public.profiles current_user_profile
    WHERE current_user_profile.user_id = auth.uid()
      AND (
        current_user_profile.role::text = 'supply_chain'
        OR current_user_profile.role::text = 'admin'
        OR current_user_profile.role::text LIKE 'planung%'
      )
  )
);