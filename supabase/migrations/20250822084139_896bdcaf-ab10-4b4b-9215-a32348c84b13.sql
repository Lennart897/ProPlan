-- Fix database functions to use integer status values instead of strings

-- Update notify_project_approval function to use integer status
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
begin
  -- Use integer status value (5 = approved)
  IF NEW.status = 5 AND OLD.status != 5 THEN
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

-- Update notify_planning_assignment function to use integer status
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
  -- Use integer status value (4 = in_progress/planning)
  IF NEW.status = 4 AND (OLD.status IS NULL OR OLD.status != 4) THEN
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

-- Remove the duplicate/conflicting trigger 'on_project_approval' 
-- (keep the newer 'project_approval_trigger' which already uses integer status)
DROP TRIGGER IF EXISTS on_project_approval ON public.manufacturing_projects;

-- Remove the duplicate planning notification trigger
DROP TRIGGER IF EXISTS trg_notify_planning_assignment ON public.manufacturing_projects;