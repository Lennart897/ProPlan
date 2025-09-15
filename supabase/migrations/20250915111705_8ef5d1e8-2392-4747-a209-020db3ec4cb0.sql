-- Update the planning notification trigger to handle both 2->4 and 3->4 status changes
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
  -- Send notification when status changes to 4 (Prüfung Planung) from either 2 (Prüfung Vertrieb) or 3 (Prüfung SupplyChain)
  IF (OLD.status IN (2, 3) AND NEW.status = 4) THEN
    RAISE LOG 'Planning notification trigger: Project % moved from status % to 4', NEW.project_number, OLD.status;
    
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