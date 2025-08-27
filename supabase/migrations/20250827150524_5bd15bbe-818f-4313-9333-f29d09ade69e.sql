-- Create the trigger for creator rejection notifications
DROP TRIGGER IF EXISTS notify_creator_project_rejection_trigger ON public.manufacturing_projects;

CREATE TRIGGER notify_creator_project_rejection_trigger
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW 
  EXECUTE FUNCTION public.notify_creator_project_rejection();