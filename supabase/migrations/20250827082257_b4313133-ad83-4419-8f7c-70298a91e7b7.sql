-- Create a policy that allows viewing basic profile information for project history
CREATE POLICY "All users can view basic profile info for project history" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Alternative approach: Create a security definer function to get user info
CREATE OR REPLACE FUNCTION public.get_user_profile_info(user_uuid uuid)
 RETURNS TABLE(display_name text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  SELECT p.display_name, p.role::text
  FROM public.profiles p
  WHERE p.user_id = user_uuid;
$$;