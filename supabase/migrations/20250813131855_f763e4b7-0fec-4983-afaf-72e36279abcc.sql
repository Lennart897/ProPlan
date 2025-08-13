-- Fix security warning: Set search_path for notify_project_insert function
CREATE OR REPLACE FUNCTION public.notify_project_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-project-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000; -- ms
  v_payload jsonb;
  v_req_id bigint;
begin
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

  -- Fire HTTP POST using signature (url, body jsonb, params jsonb, headers jsonb, timeout int)
  select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
  return NEW;
end;
$$;