-- Add produktgruppe_2 column to manufacturing_projects table
ALTER TABLE public.manufacturing_projects 
ADD COLUMN IF NOT EXISTS produktgruppe_2 text;