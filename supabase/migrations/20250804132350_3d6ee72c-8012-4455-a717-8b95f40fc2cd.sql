-- Fix security warnings by adding proper search_path to functions
CREATE OR REPLACE FUNCTION public.get_affected_locations(standort_verteilung jsonb)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  locations text[] := '{}';
  key text;
  value numeric;
BEGIN
  -- Handle null input
  IF standort_verteilung IS NULL THEN
    RETURN locations;
  END IF;
  
  FOR key, value IN SELECT * FROM jsonb_each_text(standort_verteilung)
  LOOP
    -- Only include locations with quantity > 0
    IF value::numeric > 0 THEN
      locations := array_append(locations, key);
    END IF;
  END LOOP;
  
  RETURN locations;
END;
$$;

-- Fix the can_user_approve_project function
CREATE OR REPLACE FUNCTION public.can_user_approve_project(user_uuid uuid, project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_role_text text;
  user_location text;
  project_locations text[];
  standort_verteilung jsonb;
BEGIN
  -- Get user role
  SELECT role INTO user_role_text FROM public.profiles WHERE user_id = user_uuid;
  
  -- Handle legacy 'planung' role - can approve any project for backward compatibility
  IF user_role_text = 'planung' THEN
    RETURN true;
  END IF;
  
  -- Extract location from role if it's a location-specific planning role
  IF user_role_text LIKE 'planung_%' THEN
    user_location := substring(user_role_text from 'planung_(.*)');
  ELSE
    -- Non-planning roles can't approve based on location
    RETURN false;
  END IF;
  
  -- Get project's standort_verteilung
  SELECT mp.standort_verteilung INTO standort_verteilung 
  FROM public.manufacturing_projects mp 
  WHERE mp.id = project_id;
  
  -- Get affected locations from the project
  SELECT public.get_affected_locations(standort_verteilung) INTO project_locations;
  
  -- Check if user's location is in the affected locations
  RETURN user_location = ANY(project_locations);
END;
$$;

-- Fix the get_user_role function as well
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT role FROM public.profiles WHERE user_id = user_uuid;
$function$;