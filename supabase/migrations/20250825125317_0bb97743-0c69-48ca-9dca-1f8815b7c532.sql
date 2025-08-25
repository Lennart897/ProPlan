-- Create locations table for scalable location management
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on locations table
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- RLS policies for locations
-- Admins can do everything
CREATE POLICY "Admins can view all locations" 
ON public.locations 
FOR SELECT 
USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can insert locations" 
ON public.locations 
FOR INSERT 
WITH CHECK (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can update locations" 
ON public.locations 
FOR UPDATE 
USING (get_user_role(auth.uid()) = 'admin')
WITH CHECK (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can delete locations" 
ON public.locations 
FOR DELETE 
USING (get_user_role(auth.uid()) = 'admin');

-- Authenticated users can view active locations
CREATE POLICY "Authenticated users can view active locations" 
ON public.locations 
FOR SELECT 
USING (active = true AND auth.uid() IS NOT NULL);

-- Add trigger for updated_at
CREATE TRIGGER update_locations_updated_at
BEFORE UPDATE ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial location data
INSERT INTO public.locations (name, code, active) VALUES
('Gudensberg', 'gudensberg', true),
('Brenz', 'brenz', true),
('Storkow', 'storkow', true),
('Visbek', 'visbek', true),
('Döbeln', 'doebeln', true);

-- Create location_roles table to map planning roles to locations
CREATE TABLE public.location_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE,
  location_code TEXT NOT NULL REFERENCES public.locations(code),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on location_roles table
ALTER TABLE public.location_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for location_roles
CREATE POLICY "Admins can manage location roles" 
ON public.location_roles 
FOR ALL 
USING (get_user_role(auth.uid()) = 'admin')
WITH CHECK (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "All authenticated users can view location roles" 
ON public.location_roles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Insert initial role mappings
INSERT INTO public.location_roles (role_name, location_code) VALUES
('planung_gudensberg', 'gudensberg'),
('planung_brenz', 'brenz'),
('planung_storkow', 'storkow'),
('planung_visbek', 'visbek'),
('planung_doebeln', 'doebeln');

-- Create function to get user's location from role
CREATE OR REPLACE FUNCTION public.get_user_location_code(user_uuid uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  user_role_text text;
  location_code_result text;
BEGIN
  -- Get user role
  SELECT public.get_user_role(user_uuid) INTO user_role_text;
  
  -- Check if it's a location-specific planning role
  IF user_role_text LIKE 'planung_%' THEN
    SELECT location_code INTO location_code_result
    FROM public.location_roles
    WHERE role_name = user_role_text;
    
    RETURN location_code_result;
  END IF;
  
  RETURN NULL;
END;
$function$;