-- Update notify_project_planning_correction to always send email on 4->3 and simplify deduplication
CREATE OR REPLACE FUNCTION public.notify_project_planning_correction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-project-planning-correction-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000;
  v_payload jsonb;
  v_req_id bigint;
  v_lock_key bigint;
  v_current_user_id uuid;
  v_corrected_by_name text;
  v_correction_reason text;
  v_notification_exists boolean;
begin
  -- Get current user ID
  v_current_user_id := auth.uid();
  
  -- Enhanced logging
  RAISE LOG 'PLANNING CORRECTION TRIGGER FIRED: Project % status changed from % to %, User: %', 
    NEW.project_number, OLD.status, NEW.status, v_current_user_id;
  
  -- Send email to SupplyChain when status changes TO 3 from planning-related status (4 or 5)
  IF (OLD.status IN (4, 5) AND NEW.status = 3) THEN
    -- Always set a reason (fallback)
    v_correction_reason := COALESCE(NEW.rejection_reason, 'Keine Begründung angegeben');
    
    RAISE LOG 'STATUS CHANGE DETECTED (%->3) for project % - Proceeding with notification', OLD.status, NEW.project_number;
      
    -- Check if we already sent a notification for this project/status recently (ignore reason)
    SELECT EXISTS(
      SELECT 1 FROM public.email_notifications 
      WHERE project_id = NEW.id 
        AND notification_type = 'planning_correction'
        AND project_status = NEW.status
        AND created_at > now() - interval '1 minute'
    ) INTO v_notification_exists;
      
    IF v_notification_exists THEN
      RAISE LOG 'Duplicate notification detected for project % - skipping email (recent planning_correction exists)', NEW.project_number;
      RETURN NEW;
    END IF;
      
    -- Create a lock key based on project and status change only
    v_lock_key := ('x' || md5(NEW.id::text || OLD.status::text || NEW.status::text || 'planning_correction'))::bit(64)::bigint;
      
    -- Try to acquire an advisory lock with immediate timeout
    IF pg_try_advisory_xact_lock(v_lock_key) THEN
      RAISE LOG 'ADVISORY LOCK ACQUIRED - Building payload for SupplyChain notification';
        
      -- Get the name of the user who made the change
      SELECT display_name INTO v_corrected_by_name FROM public.profiles WHERE user_id = v_current_user_id;
        
      -- Record that we're sending this notification
      INSERT INTO public.email_notifications (
        project_id, 
        notification_type, 
        user_id, 
        email_address, 
        project_status, 
        correction_reason
      ) VALUES (
        NEW.id,
        'planning_correction',
        v_current_user_id,
        'supply_chain_team@placeholder.com', -- Will be replaced with actual emails in edge function
        NEW.status,
        v_correction_reason
      ) ON CONFLICT DO NOTHING;
        
      v_payload := jsonb_build_object(
        'id', NEW.id,
        'project_number', NEW.project_number,
        'customer', NEW.customer,
        'artikel_nummer', NEW.artikel_nummer,
        'artikel_bezeichnung', NEW.artikel_bezeichnung,
        'created_by_id', NEW.created_by_id,
        'created_by_name', NEW.created_by_name,
        'correction_reason', v_correction_reason,
        'corrected_by_id', v_current_user_id,
        'corrected_by_name', COALESCE(v_corrected_by_name, 'Planungsnutzer'),
        'old_gesamtmenge', OLD.gesamtmenge,
        'new_gesamtmenge', NEW.gesamtmenge,
        'old_standort_verteilung', OLD.standort_verteilung,
        'new_standort_verteilung', NEW.standort_verteilung
      );

      RAISE LOG 'PAYLOAD BUILT - Sending HTTP request to: %', v_url;

      -- Send the HTTP request
      BEGIN
        select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
        RAISE LOG 'HTTP REQUEST SENT - Request ID: %', v_req_id;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'HTTP REQUEST FAILED: %', SQLERRM;
      END;
        
    ELSE
      RAISE LOG 'Could not acquire advisory lock for project % - duplicate prevention active', NEW.project_number;
    END IF;
  ELSE
    RAISE LOG 'Status change not matching criteria (4,5->3). OLD: %, NEW: %', OLD.status, NEW.status;
  END IF;
  
  return NEW;
end;
$function$;