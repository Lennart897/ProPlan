-- Add deduplication to prevent duplicate approval emails
CREATE OR REPLACE FUNCTION public.notify_project_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-project-approval-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000;
  v_payload jsonb;
  v_req_id bigint;
  v_lock_key bigint;
begin
  -- Only send email when status actually changes from non-approved to approved
  IF NEW.status = 5 AND (OLD.status IS NULL OR OLD.status != 5) THEN
    -- Create a unique lock key based on project ID
    v_lock_key := ('x' || md5(NEW.id::text))::bit(64)::bigint;
    
    -- Try to acquire an advisory lock to prevent duplicate executions
    IF pg_try_advisory_xact_lock(v_lock_key) THEN
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
  END IF;
  
  return NEW;
end;
$function$