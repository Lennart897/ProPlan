-- Remove duplicate trigger that causes double emails
DROP TRIGGER IF EXISTS trigger_notify_project_approval ON public.manufacturing_projects;