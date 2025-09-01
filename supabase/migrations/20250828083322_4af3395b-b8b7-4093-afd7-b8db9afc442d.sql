-- Add rejection_reason column to manufacturing_projects table
ALTER TABLE public.manufacturing_projects 
ADD COLUMN IF NOT EXISTS rejection_reason text;