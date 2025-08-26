-- Create the trigger for planning correction emails if it doesn't exist
DROP TRIGGER IF EXISTS trigger_notify_project_planning_correction ON public.manufacturing_projects;

CREATE TRIGGER trigger_notify_project_planning_correction
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_planning_correction();