-- Drop trigger if exists and recreate it
DROP TRIGGER IF EXISTS notify_project_planning_correction_trigger ON public.manufacturing_projects;

-- Create trigger for planning correction notifications (4->3 status change)
CREATE TRIGGER notify_project_planning_correction_trigger
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_planning_correction();