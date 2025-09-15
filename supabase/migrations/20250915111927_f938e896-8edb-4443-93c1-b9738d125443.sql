-- Add deduplication to prevent duplicate planning notification emails
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
  v_lock_key bigint;
  v_notification_exists boolean;
begin
  -- Send notification when status changes to 4 (Prüfung Planung) from either 2 (Prüfung Vertrieb) or 3 (Prüfung SupplyChain)
  IF (OLD.status IN (2, 3) AND NEW.status = 4) THEN
    RAISE LOG 'Planning notification trigger: Project % moved from status % to 4', NEW.project_number, OLD.status;
    
    -- Check if we already sent a planning notification for this exact status change
    SELECT EXISTS(
      SELECT 1 FROM public.email_notifications 
      WHERE project_id = NEW.id 
        AND notification_type = 'planning_assignment'
        AND project_status = NEW.status
        AND created_at > now() - interval '5 minutes'
    ) INTO v_notification_exists;
    
    IF v_notification_exists THEN
      RAISE LOG 'Duplicate planning notification detected for project % - skipping email', NEW.project_number;
      RETURN NEW;
    END IF;
    
    -- Create a unique lock key based on project ID and status change
    v_lock_key := ('x' || md5(NEW.id::text || 'planning_assignment' || NEW.status::text))::bit(64)::bigint;
    
    -- Try to acquire an advisory lock to prevent duplicate executions
    IF pg_try_advisory_xact_lock(v_lock_key) THEN
      RAISE LOG 'Advisory lock acquired for planning notification';
      
      -- Record that we're sending this notification
      INSERT INTO public.email_notifications (
        project_id, 
        notification_type, 
        user_id, 
        email_address, 
        project_status
      ) VALUES (
        NEW.id,
        'planning_assignment',
        auth.uid(),
        'planning_team@placeholder.com',
        NEW.status
      ) ON CONFLICT DO NOTHING;
      
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
      
    ELSE
      RAISE LOG 'Could not acquire advisory lock for planning notification on project %', NEW.project_number;
    END IF;
  END IF;
  
  return NEW;
end;
$function$;