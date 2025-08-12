-- Fix pg_net call signature to match installed version
create or replace function public.notify_project_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
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

create or replace function public.notify_task_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-task-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000; -- ms
  v_payload jsonb;
  v_req_id bigint;
begin
  v_payload := jsonb_build_object(
    'id', NEW.id,
    'title', NEW.title,
    'description', NEW.description,
    'assigned_to', NEW.assigned_to
  );

  select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
  return NEW;
end;
$$;