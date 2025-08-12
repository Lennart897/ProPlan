-- Create triggers to invoke email edge functions on insert events
-- Ensure idempotency
DROP TRIGGER IF EXISTS trg_notify_project_insert ON public.manufacturing_projects;
CREATE TRIGGER trg_notify_project_insert
AFTER INSERT ON public.manufacturing_projects
FOR EACH ROW EXECUTE FUNCTION public.notify_project_insert();

DROP TRIGGER IF EXISTS trg_notify_task_insert ON public.tasks;
CREATE TRIGGER trg_notify_task_insert
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_insert();