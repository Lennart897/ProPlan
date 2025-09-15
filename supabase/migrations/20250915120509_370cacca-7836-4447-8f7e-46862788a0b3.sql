-- Update notify_project_approval to include 4->5 status changes
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
  v_notification_exists boolean;
begin
  -- Send email when status changes to approved (5) from any non-approved status including 4
  IF NEW.status = 5 AND (OLD.status IS NULL OR OLD.status != 5) THEN
    RAISE LOG 'Project approval trigger: Project % status changed from % to 5', NEW.project_number, OLD.status;
    
    -- Check for duplicate notifications within last 5 minutes
    SELECT EXISTS(
      SELECT 1 FROM public.email_notifications 
      WHERE project_id = NEW.id 
        AND notification_type = 'project_approval'
        AND project_status = NEW.status
        AND created_at > now() - interval '5 minutes'
    ) INTO v_notification_exists;
    
    IF v_notification_exists THEN
      RAISE LOG 'Duplicate approval notification detected for project % - skipping email', NEW.project_number;
      RETURN NEW;
    END IF;
    
    -- Create a unique lock key based on project ID
    v_lock_key := ('x' || md5(NEW.id::text || 'project_approval'))::bit(64)::bigint;
    
    -- Try to acquire an advisory lock to prevent duplicate executions
    IF pg_try_advisory_xact_lock(v_lock_key) THEN
      RAISE LOG 'Advisory lock acquired for project approval';
      
      -- Record that we're sending this notification
      INSERT INTO public.email_notifications (
        project_id, 
        notification_type, 
        user_id, 
        email_address, 
        project_status
      ) VALUES (
        NEW.id,
        'project_approval',
        auth.uid(),
        'project_creator@placeholder.com',
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

      RAISE LOG 'Sending project approval email for project %', NEW.project_number;
      
      BEGIN
        select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
        RAISE LOG 'Project approval email sent - Request ID: %', v_req_id;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'Project approval email failed: %', SQLERRM;
      END;
    ELSE
      RAISE LOG 'Could not acquire advisory lock for project approval on project %', NEW.project_number;
    END IF;
  END IF;
  
  return NEW;
end;
$function$;