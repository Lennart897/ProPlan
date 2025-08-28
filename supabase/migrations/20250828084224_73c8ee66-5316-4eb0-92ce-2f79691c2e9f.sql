-- Update the creator rejection trigger to handle NULL rejection_reason gracefully
CREATE OR REPLACE FUNCTION public.notify_creator_project_rejection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-project-rejection-supply-chain-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000;
  v_payload jsonb;
  v_req_id bigint;
  v_lock_key bigint;
  v_current_user_id uuid;
  v_rejected_by_name text;
  v_notification_exists boolean;
  v_rejection_reason text;
begin
  v_current_user_id := auth.uid();
  v_rejection_reason := COALESCE(NEW.rejection_reason, 'Keine Begründung angegeben');
  
  RAISE LOG 'Creator rejection trigger fired: Project % status changed from % to %, User: %', 
    NEW.project_number, OLD.status, NEW.status, v_current_user_id;
  
  -- Only send email when creator changes status from 5 (approved) to 6 (rejected)
  IF OLD.status = 5 AND NEW.status = 6 AND NEW.created_by_id = v_current_user_id THEN
    RAISE LOG 'Creator rejection detected for project %', NEW.project_number;
    
    -- Check if we already sent a notification for this exact rejection within the last 5 minutes
    SELECT EXISTS(
      SELECT 1 FROM public.email_notifications 
      WHERE project_id = NEW.id 
        AND notification_type = 'creator_rejection'
        AND project_status = NEW.status
        AND rejection_reason = v_rejection_reason
        AND created_at > now() - interval '5 minutes'
    ) INTO v_notification_exists;
    
    IF v_notification_exists THEN
      RAISE LOG 'Duplicate creator rejection notification detected for project % - skipping email', NEW.project_number;
      RETURN NEW;
    END IF;
    
    -- Create a unique lock key
    v_lock_key := ('x' || md5(NEW.id::text || 'creator_rejection' || v_rejection_reason))::bit(64)::bigint;
    
    -- Try to acquire an advisory lock
    IF pg_try_advisory_xact_lock(v_lock_key) THEN
      RAISE LOG 'Advisory lock acquired for creator rejection';
      
      -- Record that we're sending this notification
      INSERT INTO public.email_notifications (
        project_id, 
        notification_type, 
        user_id, 
        email_address, 
        project_status, 
        rejection_reason
      ) VALUES (
        NEW.id,
        'creator_rejection',
        v_current_user_id,
        'creator_rejection@placeholder.com',
        NEW.status,
        v_rejection_reason
      ) ON CONFLICT DO NOTHING;
      
      -- Get the name of the user who rejected the project
      SELECT display_name INTO v_rejected_by_name FROM public.profiles WHERE user_id = v_current_user_id;
      
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
        'created_by_name', NEW.created_by_name,
        'rejection_reason', v_rejection_reason
      );

      RAISE LOG 'Payload built for creator rejection - Sending HTTP request';

      -- Send the HTTP request
      BEGIN
        select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
        RAISE LOG 'Creator rejection HTTP request sent - Request ID: %', v_req_id;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'Creator rejection HTTP request failed: %', SQLERRM;
      END;
      
    ELSE
      RAISE LOG 'Could not acquire advisory lock for creator rejection on project %', NEW.project_number;
    END IF;
  ELSE
    RAISE LOG 'Creator rejection criteria not met. OLD: %, NEW: %, Creator: %, Current User: %', 
      OLD.status, NEW.status, NEW.created_by_id, v_current_user_id;
  END IF;
  
  return NEW;
end;
$function$;