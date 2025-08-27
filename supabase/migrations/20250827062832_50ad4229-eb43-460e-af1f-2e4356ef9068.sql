-- Improve the planning correction trigger to prevent duplicate executions
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
begin
  -- Get current user ID
  v_current_user_id := auth.uid();
  
  -- Enhanced logging
  RAISE LOG 'PLANNING CORRECTION TRIGGER FIRED: Project % status changed from % to %, User: %', 
    NEW.project_number, OLD.status, NEW.status, v_current_user_id;
  
  -- Send email to SupplyChain when status changes TO 3 from planning-related status (4 or 5)
  -- This happens when planning users make corrections
  IF (OLD.status IN (4, 5) AND NEW.status = 3) THEN
    -- Only send email if there's actually a correction reason
    v_correction_reason := COALESCE(NEW.rejection_reason, '');
    
    IF v_correction_reason != '' THEN
      RAISE LOG 'STATUS CHANGE DETECTED (%->3) for project % with reason - Sending email to SupplyChain', OLD.status, NEW.project_number;
      
      -- Create a more robust lock key based on project ID, timestamp to minute, and status change
      -- This prevents duplicate emails within the same minute for the same project and status change
      v_lock_key := ('x' || md5(NEW.id::text || date_trunc('minute', now())::text || OLD.status::text || NEW.status::text))::bit(64)::bigint;
      
      -- Try to acquire an advisory lock with immediate timeout
      IF pg_try_advisory_xact_lock(v_lock_key) THEN
        RAISE LOG 'ADVISORY LOCK ACQUIRED - Building payload for SupplyChain notification';
        
        -- Get the name of the user who made the change
        SELECT display_name INTO v_corrected_by_name FROM public.profiles WHERE user_id = v_current_user_id;
        
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
      RAISE LOG 'No correction reason provided for project % - no email sent', NEW.project_number;
    END IF;
  ELSE
    RAISE LOG 'Status change not matching criteria (4,5->3). OLD: %, NEW: %', OLD.status, NEW.status;
  END IF;
  
  return NEW;
end;
$function$;