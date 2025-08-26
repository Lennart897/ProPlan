-- Add the missing config for send-project-correction-email function
-- This needs to be done via config.toml file update, but first let's check if the trigger is working
-- by adding more detailed logging

CREATE OR REPLACE FUNCTION public.notify_project_correction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-project-correction-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000;
  v_payload jsonb;
  v_req_id bigint;
  v_lock_key bigint;
  v_user_role text;
  v_current_user_id uuid;
begin
  -- Get current user ID and role
  v_current_user_id := auth.uid();
  
  -- Enhanced logging
  RAISE LOG 'CORRECTION TRIGGER FIRED: Project % status changed from % to %, User: %', 
    NEW.project_number, OLD.status, NEW.status, v_current_user_id;
  
  -- Only proceed for status change from 3 to 2
  IF OLD.status = 3 AND NEW.status = 2 THEN
    RAISE LOG 'STATUS CHANGE DETECTED (3->2) for project %', NEW.project_number;
    
    -- Get the role of the user who made the change
    SELECT role INTO v_user_role FROM public.profiles WHERE user_id = v_current_user_id;
    
    RAISE LOG 'User role: % for user %', v_user_role, v_current_user_id;
    
    -- Only proceed if the user has supply_chain role
    IF v_user_role = 'supply_chain' THEN
      RAISE LOG 'SUPPLY CHAIN USER CONFIRMED - Proceeding with correction email';
      
      -- Create a unique lock key
      v_lock_key := ('x' || md5(NEW.id::text || extract(epoch from now())::text))::bit(64)::bigint;
      
      -- Try to acquire an advisory lock
      IF pg_try_advisory_xact_lock(v_lock_key) THEN
        RAISE LOG 'ADVISORY LOCK ACQUIRED - Building payload';
        
        v_payload := jsonb_build_object(
          'id', NEW.id,
          'project_number', NEW.project_number,
          'customer', NEW.customer,
          'artikel_nummer', NEW.artikel_nummer,
          'artikel_bezeichnung', NEW.artikel_bezeichnung,
          'created_by_id', NEW.created_by_id,
          'created_by_name', NEW.created_by_name,
          'correction_reason', NEW.rejection_reason
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
        RAISE LOG 'Could not acquire advisory lock for project %', NEW.project_number;
      END IF;
    ELSE
      RAISE LOG 'User role % is not supply_chain, email not sent', v_user_role;
    END IF;
  ELSE
    RAISE LOG 'Status change not matching criteria (3->2). OLD: %, NEW: %', OLD.status, NEW.status;
  END IF;
  
  return NEW;
end;
$function$;