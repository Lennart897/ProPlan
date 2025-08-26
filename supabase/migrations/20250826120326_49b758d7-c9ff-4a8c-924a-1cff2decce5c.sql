-- Check what triggers exist on manufacturing_projects
SELECT trigger_name, event_manipulation, action_timing, action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'manufacturing_projects';

-- Drop and recreate the trigger with proper debugging
DROP TRIGGER IF EXISTS project_rejection_notification ON public.manufacturing_projects;

-- Recreate trigger with better function
CREATE TRIGGER project_rejection_notification
  AFTER UPDATE OF status, rejection_reason ON public.manufacturing_projects
  FOR EACH ROW
  WHEN (OLD.status = 3 AND NEW.status = 6)
  EXECUTE FUNCTION public.notify_project_rejection();