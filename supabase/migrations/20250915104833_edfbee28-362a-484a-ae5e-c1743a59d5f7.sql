-- Update the planning notification trigger to be more specific
-- Only send notifications when moving from status 2 (Prüfung Vertrieb) to status 4 (Prüfung Planung)
CREATE OR REPLACE FUNCTION public.notify_planning_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-planning-notification';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000;
  v_payload jsonb;
  v_req_id bigint;
begin
  -- Send notification specifically when status changes from 2 (Prüfung Vertrieb) to 4 (Prüfung Planung)
  IF OLD.status = 2 AND NEW.status = 4 THEN
    RAISE LOG 'Planning notification trigger: Project % moved from status 2 to 4', NEW.project_number;
    
    v_payload := jsonb_build_object(
      'id', NEW.id,
      'project_number', NEW.project_number,
      'customer', NEW.customer,
      'artikel_nummer', NEW.artikel_nummer,
      'artikel_bezeichnung', NEW.artikel_bezeichnung,
      'gesamtmenge', NEW.gesamtmenge,
      'erste_anlieferung', NEW.erste_anlieferung,
      'letzte_anlieferung', NEW.letzte_anlieferung,
      'beschreibung', NEW.beschreibung,
      'standort_verteilung', NEW.standort_verteilung,
      'created_by_id', NEW.created_by_id,
      'created_by_name', NEW.created_by_name
    );

    -- Send HTTP request to planning notification function
    BEGIN
      select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
      RAISE LOG 'Planning notification sent successfully - Request ID: %', v_req_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'Planning notification failed: %', SQLERRM;
    END;
  END IF;
  
  return NEW;
end;
$function$;

-- Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS trg_notify_planning_assignment ON public.manufacturing_projects;
CREATE TRIGGER trg_notify_planning_assignment
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_planning_assignment();