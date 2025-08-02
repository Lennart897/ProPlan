-- Drop existing projects table if it exists
DROP TABLE IF EXISTS public.projects;

-- Create manufacturing projects table matching the current system
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

-- Create policies for role-based access
CREATE POLICY "Vertrieb can view all projects" 
ON public.manufacturing_projects 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'vertrieb'
  )
);

CREATE POLICY "Supply Chain can view pending projects" 
ON public.manufacturing_projects 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'supply_chain'
  ) AND status = 'pending'
);

CREATE POLICY "Planung can view in_progress projects" 
ON public.manufacturing_projects 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'planung'
  ) AND status = 'in_progress'
);

CREATE POLICY "Vertrieb can create projects" 
ON public.manufacturing_projects 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'vertrieb'
  ) AND created_by_id = auth.uid()
);

CREATE POLICY "All roles can update projects they can see" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND (
      profiles.role = 'vertrieb' OR
      (profiles.role = 'supply_chain' AND status = 'pending') OR
      (profiles.role = 'planung' AND status = 'in_progress')
    )
  )
);

-- Add missing policies for profiles table
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_manufacturing_projects_updated_at
BEFORE UPDATE ON public.manufacturing_projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();