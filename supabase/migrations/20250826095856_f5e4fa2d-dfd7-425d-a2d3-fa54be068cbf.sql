-- Remove the duplicate trigger that calls notify_project_insert
DROP TRIGGER IF EXISTS project_insert_trigger ON manufacturing_projects;

-- Keep only the unique_project_email_notification trigger