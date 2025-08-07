-- Add archived status to manufacturing_projects
-- Update the status check to include 'archived'
ALTER TABLE manufacturing_projects DROP CONSTRAINT IF EXISTS manufacturing_projects_status_check;
ALTER TABLE manufacturing_projects ADD CONSTRAINT manufacturing_projects_status_check 
CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'in_progress', 'completed', 'archived'));