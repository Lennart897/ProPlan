-- Drop existing triggers if they exist to recreate them properly
DROP TRIGGER IF EXISTS trigger_refresh_project_status_on_approval_change ON public.project_location_approvals;
DROP TRIGGER IF EXISTS trigger_notify_project_approval ON public.manufacturing_projects;
DROP TRIGGER IF EXISTS trigger_create_location_approvals ON public.manufacturing_projects;

-- Create trigger to create location approvals when project moves to status 4
CREATE TRIGGER trigger_create_location_approvals
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_on_project_status_to_in_progress();

-- Create trigger to refresh project status when location approvals change
CREATE TRIGGER trigger_refresh_project_status_on_approval_change
  AFTER INSERT OR UPDATE OR DELETE ON public.project_location_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_project_status();

-- Create trigger to send approval notification when project is approved (status 5)
CREATE TRIGGER trigger_notify_project_approval
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_approval();