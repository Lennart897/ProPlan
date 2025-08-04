-- Update the handle_new_user function to properly cast role to app_role enum
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, role)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'display_name',
    CASE 
      WHEN NEW.raw_user_meta_data->>'role' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'role')::public.app_role
      ELSE 'vertrieb'::public.app_role  -- Default role if none specified
    END
  );
  RETURN NEW;
END;
$$;