-- Add rejection_reason field to manufacturing_projects table
ALTER TABLE public.manufacturing_projects 
ADD COLUMN rejection_reason TEXT;

-- Create project_history table for audit trail
CREATE TABLE public.project_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.manufacturing_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL, -- 'approved', 'rejected', 'corrected', 'created', 'submitted'
  reason TEXT, -- For rejection reasons or correction details
  previous_status TEXT,
  new_status TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on project_history
ALTER TABLE public.project_history ENABLE ROW LEVEL SECURITY;

-- Create policies for project_history
CREATE POLICY "Users can view project history for projects they can see" 
ON public.project_history 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.manufacturing_projects mp 
    WHERE mp.id = project_history.project_id
  )
);

CREATE POLICY "Authenticated users can insert project history" 
ON public.project_history 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_project_history_project_id ON public.project_history(project_id);
CREATE INDEX idx_project_history_created_at ON public.project_history(created_at);