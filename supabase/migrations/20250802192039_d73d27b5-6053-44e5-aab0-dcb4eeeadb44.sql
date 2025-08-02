-- Create manufacturing projects table for the new system
CREATE TABLE public.manufacturing_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer TEXT NOT NULL,
  artikel_nummer TEXT NOT NULL,
  artikel_bezeichnung TEXT NOT NULL,
  gesamtmenge INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'in_progress', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by_id UUID NOT NULL REFERENCES auth.users(id),
  created_by_name TEXT NOT NULL,
  standort_verteilung JSONB,
  menge_fix BOOLEAN DEFAULT false
);

-- Enable Row Level Security
ALTER TABLE public.manufacturing_projects ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE user_id = user_uuid;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Create policies for role-based access
CREATE POLICY "Vertrieb can view all projects" 
ON public.manufacturing_projects 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'vertrieb');

CREATE POLICY "Supply Chain can view pending projects" 
ON public.manufacturing_projects 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'supply_chain' AND status = 'pending');

CREATE POLICY "Planung can view in_progress projects" 
ON public.manufacturing_projects 
FOR SELECT 
USING (public.get_user_role(auth.uid()) = 'planung' AND status = 'in_progress');

CREATE POLICY "Vertrieb can create projects" 
ON public.manufacturing_projects 
FOR INSERT 
WITH CHECK (public.get_user_role(auth.uid()) = 'vertrieb' AND created_by_id = auth.uid());

CREATE POLICY "All roles can update projects they can see" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (
  (public.get_user_role(auth.uid()) = 'vertrieb') OR
  (public.get_user_role(auth.uid()) = 'supply_chain' AND status = 'pending') OR
  (public.get_user_role(auth.uid()) = 'planung' AND status = 'in_progress')
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_manufacturing_projects_updated_at
BEFORE UPDATE ON public.manufacturing_projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();