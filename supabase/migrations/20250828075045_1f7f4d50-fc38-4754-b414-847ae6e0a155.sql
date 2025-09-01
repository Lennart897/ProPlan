-- Remove duplicate creator rejection trigger
DROP TRIGGER IF EXISTS trg_notify_creator_project_rejection ON public.manufacturing_projects;

-- Ensure we only have one trigger for project rejection notifications that handles both 3->6 and 5->6 transitions
DROP TRIGGER IF EXISTS project_rejection_notification ON public.manufacturing_projects;
CREATE TRIGGER project_rejection_notification
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  WHEN (
    (OLD.status = 3 AND NEW.status = 6) OR  -- Supply chain rejection (3->6)
    (OLD.status = 5 AND NEW.status = 6)     -- Creator/approved project rejection (5->6)
  )
  EXECUTE FUNCTION public.notify_project_rejection();