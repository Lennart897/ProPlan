-- Setze Projekt 113 zurück auf Status 3 für Test
UPDATE manufacturing_projects 
SET status = 3, rejection_reason = NULL
WHERE project_number = 113;