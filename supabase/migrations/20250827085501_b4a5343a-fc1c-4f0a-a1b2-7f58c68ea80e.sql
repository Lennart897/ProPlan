-- Create a function to auto-complete expired projects
CREATE OR REPLACE FUNCTION public.auto_complete_expired_projects()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  project_record RECORD;
  completed_count INT := 0;
BEGIN
  -- Update projects that are approved (status 5) and past their last delivery date
  FOR project_record IN 
    SELECT id, project_number, customer, letzte_anlieferung
    FROM public.manufacturing_projects
    WHERE status = 5 -- GENEHMIGT
      AND letzte_anlieferung IS NOT NULL
      AND letzte_anlieferung < CURRENT_DATE -- Past due
  LOOP
    -- Update project status to completed (7)
    UPDATE public.manufacturing_projects
    SET status = 7, -- ABGESCHLOSSEN
        updated_at = now()
    WHERE id = project_record.id;
    
    -- Insert project history record
    INSERT INTO public.project_history (
      project_id,
      user_id,
      user_name,
      action,
      previous_status,
      new_status,
      reason
    ) VALUES (
      project_record.id,
      '00000000-0000-0000-0000-000000000000', -- System user ID
      'System',
      'Projekt automatisch abgeschlossen',
      'Genehmigt',
      'Abgeschlossen',
      'Automatisch abgeschlossen da letztes Anlieferdatum (' || project_record.letzte_anlieferung || ') überschritten wurde'
    );
    
    completed_count := completed_count + 1;
    
    RAISE LOG 'Auto-completed project % (%) - Last delivery: %', 
      project_record.project_number, project_record.customer, project_record.letzte_anlieferung;
  END LOOP;
  
  RAISE LOG 'Auto-completion function completed. Projects updated: %', completed_count;
END;
$function$;