-- Create HTTP notify function for project insert
CREATE OR REPLACE FUNCTION public.notify_project_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM supabase_functions.http_request(
    'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-project-email',
    'POST',
    jsonb_build_object(
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
    ),
    jsonb_build_object(
      'Content-Type', 'application/json'
    )
  );
  RETURN NEW;
END;
$function$;

-- Ensure fresh trigger
DROP TRIGGER IF EXISTS trg_notify_project_insert ON public.manufacturing_projects;

CREATE TRIGGER trg_notify_project_insert
AFTER INSERT ON public.manufacturing_projects
FOR EACH ROW
EXECUTE FUNCTION public.notify_project_insert();