-- Enable pg_net extension for HTTP calls from Postgres
create extension if not exists pg_net;

-- Replace notify_project_insert to use pg_net instead of supabase_functions
create or replace function public.notify_project_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-project-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_payload jsonb;
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

  -- Fire-and-forget HTTP POST to Edge Function
  perform net.http_post(
    url := v_url,
    headers := v_headers,
    body := v_payload::text
  );

  return NEW;
end;
$$;

-- Replace notify_task_insert to use pg_net as well
create or replace function public.notify_task_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-task-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'id', NEW.id,
    'title', NEW.title,
    'description', NEW.description,
    'assigned_to', NEW.assigned_to
  );

  perform net.http_post(
    url := v_url,
    headers := v_headers,
    body := v_payload::text
  );

  return NEW;
end;
$$;

-- Ensure triggers exist for manufacturing_projects and tasks
-- manufacturing_projects AFTER INSERT trigger
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_notify_project_insert'
  ) then
    create trigger trg_notify_project_insert
    after insert on public.manufacturing_projects
    for each row execute function public.notify_project_insert();
  end if;
end $$;

-- tasks AFTER INSERT trigger (keep existing if already present)
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_notify_task_insert'
  ) then
    create trigger trg_notify_task_insert
    after insert on public.tasks
    for each row execute function public.notify_task_insert();
  end if;
end $$;