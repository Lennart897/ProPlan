-- Remove duplicate trigger for project correction notifications
-- Keep only the newer project_correction_notification_trigger
DROP TRIGGER IF EXISTS project_correction_notification ON public.manufacturing_projects;