-- Simuliere eine Projektablehnung durch den supply_chain User
-- Dies sollte den Trigger auslösen, da der aktuelle User eine supply_chain Rolle hat

UPDATE manufacturing_projects 
SET 
  status = 6, 
  rejection_reason = 'Test-Ablehnung durch Supply Chain für E-Mail-Test',
  updated_at = now()
WHERE project_number = 113;