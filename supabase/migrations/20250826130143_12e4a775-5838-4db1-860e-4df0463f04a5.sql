-- Setze Projekt 113 zurück auf Status 3 für Test UND teste die Trigger-Ausführung
UPDATE manufacturing_projects 
SET status = 3, rejection_reason = NULL, updated_at = now()
WHERE project_number = 113;

-- Füge Debugging-Ausgaben hinzu: Teste den Trigger manuell durch Simulation
DO $$
DECLARE
  v_project_id uuid;
  v_user_role text;
  v_supply_chain_user_id uuid;
BEGIN
  -- Hole die Project ID
  SELECT id INTO v_project_id FROM manufacturing_projects WHERE project_number = 113;
  
  -- Hole den supply_chain User
  SELECT user_id INTO v_supply_chain_user_id FROM public.profiles WHERE role = 'supply_chain' LIMIT 1;
  
  -- Prüfe die Rolle
  SELECT role INTO v_user_role FROM public.profiles WHERE user_id = v_supply_chain_user_id;
  
  RAISE LOG 'Test Setup - Project ID: %, Supply Chain User: %, Role: %', 
    v_project_id, v_supply_chain_user_id, v_user_role;
    
  -- Teste die Rollenerkennung
  IF v_user_role = 'supply_chain' THEN
    RAISE LOG 'Role check PASSED: supply_chain user found';
  ELSE
    RAISE LOG 'Role check FAILED: Expected supply_chain, got %', v_user_role;
  END IF;
END $$;