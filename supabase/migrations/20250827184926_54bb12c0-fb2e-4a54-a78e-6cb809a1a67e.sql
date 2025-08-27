-- Create trigger for project rejection notifications (both 3->6 and 5->6 status changes)
DROP TRIGGER IF EXISTS project_rejection_notification ON public.manufacturing_projects;

CREATE TRIGGER project_rejection_notification
  AFTER UPDATE OF status, rejection_reason ON public.manufacturing_projects
  FOR EACH ROW
  WHEN ((OLD.status = 3 AND NEW.status = 6) OR (OLD.status = 5 AND NEW.status = 6))
  EXECUTE FUNCTION public.notify_project_rejection();