-- Setze das Projekt für einen echten UI-Test zurück
UPDATE manufacturing_projects 
SET status = 3, rejection_reason = NULL, updated_at = now()
WHERE project_number = 113;