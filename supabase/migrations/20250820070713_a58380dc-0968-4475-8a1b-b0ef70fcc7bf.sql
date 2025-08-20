-- Create function to notify planning users when project status changes to in_progress
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
  -- Only trigger when status changes to 'in_progress' (not when it's already in_progress)
  IF NEW.status = 'in_progress' AND (OLD.status IS NULL OR OLD.status != 'in_progress') THEN
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

    select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
  END IF;
  
  return NEW;
end;
$function$;

-- Create trigger to call the planning notification function
CREATE TRIGGER trg_notify_planning_assignment
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_planning_assignment();