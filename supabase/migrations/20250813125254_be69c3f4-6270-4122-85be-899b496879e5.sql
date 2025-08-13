-- Ensure AFTER INSERT trigger exists to notify Make via edge function
DROP TRIGGER IF EXISTS on_manufacturing_projects_insert_notify ON public.manufacturing_projects;

CREATE TRIGGER on_manufacturing_projects_insert_notify
AFTER INSERT ON public.manufacturing_projects
FOR EACH ROW
EXECUTE FUNCTION public.notify_project_insert();