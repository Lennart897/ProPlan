-- Check if the trigger exists and recreate it properly
DROP TRIGGER IF EXISTS project_approval_trigger ON public.manufacturing_projects;

-- Create the trigger that fires when a project is approved
CREATE TRIGGER project_approval_trigger
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_approval();