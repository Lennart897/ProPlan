-- Check and create the trigger for notify_creator_project_rejection
-- First drop the trigger if it exists to avoid conflicts
DROP TRIGGER IF EXISTS notify_creator_project_rejection_trigger ON public.manufacturing_projects;

-- Create the trigger for creator rejection notifications (5->6 status change)
CREATE TRIGGER notify_creator_project_rejection_trigger
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_creator_project_rejection();