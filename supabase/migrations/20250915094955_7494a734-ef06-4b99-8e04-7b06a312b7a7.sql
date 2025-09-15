-- Add columns to project_history table to store original and new data for corrections
ALTER TABLE public.project_history 
ADD COLUMN old_data jsonb,
ADD COLUMN new_data jsonb;