-- First, check if there are multiple triggers and drop any duplicates
DROP TRIGGER IF EXISTS project_approval_trigger ON manufacturing_projects;

-- Recreate the trigger with better conditions to prevent duplicates
CREATE OR REPLACE TRIGGER project_approval_trigger
AFTER UPDATE ON manufacturing_projects
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved')
EXECUTE FUNCTION notify_project_approval();