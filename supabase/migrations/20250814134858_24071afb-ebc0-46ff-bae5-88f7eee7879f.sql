-- First, let's check if there are any existing triggers on manufacturing_projects
SELECT 
  t.tgname as trigger_name,
  c.relname as table_name,
  p.proname as function_name,
  t.tgenabled
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'manufacturing_projects'
AND t.tgisinternal = false;

-- Drop any existing triggers that might cause duplicate emails
DROP TRIGGER IF EXISTS notify_project_insert_trigger ON public.manufacturing_projects;
DROP TRIGGER IF EXISTS on_project_insert ON public.manufacturing_projects;

-- Create a single trigger that fires AFTER INSERT to avoid duplicates
CREATE TRIGGER manufacturing_project_email_notification
  AFTER INSERT ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_insert();