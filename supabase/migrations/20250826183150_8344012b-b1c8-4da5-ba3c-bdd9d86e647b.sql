-- Create trigger for planning correction notifications
CREATE TRIGGER notify_project_planning_correction_trigger
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_planning_correction();