-- Check existing triggers on manufacturing_projects table
SELECT trigger_name, event_manipulation, event_object_table, action_statement, action_timing, action_orientation
FROM information_schema.triggers 
WHERE event_object_table = 'manufacturing_projects';

-- Drop existing trigger if it exists and recreate it
DROP TRIGGER IF EXISTS project_rejection_notification ON public.manufacturing_projects;

-- Create the trigger to fire on UPDATE
CREATE TRIGGER project_rejection_notification
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_rejection();