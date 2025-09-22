-- Replace profiles SELECT policy to avoid recursion and allow proper access
DROP POLICY IF EXISTS "Users can view profiles for project history context" ON public.profiles;

CREATE POLICY "Profiles view: self, history peers, privileged"
ON public.profiles
FOR SELECT
USING (
  -- Always own profile
  auth.uid() = user_id
  OR
  -- Profiles of users who co-appear in project history with current user
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
  -- Privileged roles via SECURITY DEFINER function (no self-reference!)
  public.get_user_role(auth.uid()) = 'supply_chain'
  OR public.get_user_role(auth.uid()) = 'admin'
  OR public.get_user_role(auth.uid()) LIKE 'planung%'
);