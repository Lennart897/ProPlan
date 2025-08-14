-- Entferne alle bestehenden E-Mail Trigger
DROP TRIGGER IF EXISTS on_manufacturing_projects_insert_notify ON public.manufacturing_projects;
DROP TRIGGER IF EXISTS trg_notify_project_insert ON public.manufacturing_projects;
DROP TRIGGER IF EXISTS manufacturing_project_email_notification ON public.manufacturing_projects;
DROP TRIGGER IF EXISTS notify_project_insert_trigger ON public.manufacturing_projects;

-- Stelle sicher, dass nur EIN Trigger für E-Mail-Benachrichtigungen existiert
CREATE TRIGGER unique_project_email_notification
  AFTER INSERT ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_insert();

-- Überprüfe die aktuellen Trigger
SELECT 
  t.tgname as trigger_name,
  c.relname as table_name,
  p.proname as function_name,
  t.tgenabled
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'manufacturing_projects'
AND t.tgisinternal = false
ORDER BY t.tgname;