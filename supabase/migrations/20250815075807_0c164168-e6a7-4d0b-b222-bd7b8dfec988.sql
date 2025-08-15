-- Create trigger for project approval notifications
CREATE OR REPLACE FUNCTION public.notify_project_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-project-approval-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000; -- ms
  v_payload jsonb;
  v_req_id bigint;
begin
  -- Only trigger when status changes to 'approved'
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
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

    -- Fire HTTP POST
    select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
  END IF;
  
  return NEW;
end;
$function$

-- Create trigger for project approval
DROP TRIGGER IF EXISTS on_project_approval ON public.manufacturing_projects;
CREATE TRIGGER on_project_approval
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_approval();