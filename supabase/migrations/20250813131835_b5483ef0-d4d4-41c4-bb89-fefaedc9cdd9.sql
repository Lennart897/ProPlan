-- Create the function that triggers the edge function
CREATE OR REPLACE FUNCTION public.notify_project_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call the send-project-email edge function via HTTP
  PERFORM
    net.http_post(
      url := 'https://rhubaybwftyypfbiuoyc.supabase.co/functions/v1/send-project-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
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
      )
    );
  
  RETURN NEW;
END;
$$;