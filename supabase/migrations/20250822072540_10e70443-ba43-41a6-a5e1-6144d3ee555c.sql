-- First, add the new columns
ALTER TABLE public.manufacturing_projects 
ADD COLUMN status_new INTEGER NOT NULL DEFAULT 1,
ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE NULL;

-- Migrate existing status values
UPDATE public.manufacturing_projects SET status_new = 
  CASE 
    WHEN status = 'draft' THEN 1
    WHEN status = 'pending' THEN 3  
    WHEN status = 'in_progress' THEN 4
    WHEN status = 'approved' THEN 5
    WHEN status = 'rejected' THEN 6
    WHEN status = 'archived' THEN 7
    ELSE 1
  END;

-- Drop the old status column and rename the new one
ALTER TABLE public.manufacturing_projects DROP COLUMN status;
ALTER TABLE public.manufacturing_projects RENAME COLUMN status_new TO status;

-- Update the default for new projects to automatically go to status 3 (Prüfung SupplyChain)
ALTER TABLE public.manufacturing_projects ALTER COLUMN status SET DEFAULT 3;

-- Create index for better performance on archived projects
CREATE INDEX idx_manufacturing_projects_archived ON public.manufacturing_projects(archived, status);
CREATE INDEX idx_manufacturing_projects_archived_at ON public.manufacturing_projects(archived_at) WHERE archived_at IS NOT NULL;