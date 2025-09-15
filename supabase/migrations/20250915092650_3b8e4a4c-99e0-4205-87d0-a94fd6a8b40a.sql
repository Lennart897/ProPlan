-- Create the missing trigger for project correction notifications
CREATE TRIGGER project_correction_notification_trigger
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_correction();