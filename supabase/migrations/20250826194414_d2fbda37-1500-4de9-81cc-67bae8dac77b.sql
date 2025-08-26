-- Fix the trigger to also send emails when planning corrects from approved status (5->3)
DROP TRIGGER IF EXISTS notify_project_planning_correction_trigger ON public.manufacturing_projects;

-- Update the function to handle both 4->3 and 5->3 status changes
CREATE OR REPLACE FUNCTION public.notify_project_planning_correction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.supabase.co/functions/v1/send-project-planning-correction-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000;
  v_payload jsonb;
  v_req_id bigint;
  v_lock_key bigint;
  v_current_user_id uuid;
  v_corrected_by_name text;
begin
  -- Get current user ID
  v_current_user_id := auth.uid();
  
  -- Enhanced logging
  RAISE LOG 'PLANNING CORRECTION TRIGGER FIRED: Project % status changed from % to %, User: %', 
    NEW.project_number, OLD.status, NEW.status, v_current_user_id;
  
  -- Send email to SupplyChain when status changes to 3 from 4 OR 5 (planning correction)
  IF (OLD.status = 4 OR OLD.status = 5) AND NEW.status = 3 THEN
    RAISE LOG 'STATUS CHANGE DETECTED (%->3) for project % - Sending email to SupplyChain', OLD.status, NEW.project_number;
    
    -- Get the name of the user who made the change
    SELECT display_name INTO v_corrected_by_name FROM public.profiles WHERE user_id = v_current_user_id;
    
    -- Create a unique lock key
    v_lock_key := ('x' || md5(NEW.id::text || extract(epoch from now())::text))::bit(64)::bigint;
    
    -- Try to acquire an advisory lock
    IF pg_try_advisory_xact_lock(v_lock_key) THEN
      RAISE LOG 'ADVISORY LOCK ACQUIRED - Building payload for SupplyChain notification';
      
      v_payload := jsonb_build_object(
        'id', NEW.id,
        'project_number', NEW.project_number,
        'customer', NEW.customer,
        'artikel_nummer', NEW.artikel_nummer,
        'artikel_bezeichnung', NEW.artikel_bezeichnung,
        'created_by_id', NEW.created_by_id,
        'created_by_name', NEW.created_by_name,
        'correction_reason', NEW.rejection_reason,
        'corrected_by_id', v_current_user_id,
        'corrected_by_name', COALESCE(v_corrected_by_name, 'Planungsnutzer')
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
    RAISE LOG 'Status change not matching criteria (4/5->3). OLD: %, NEW: %', OLD.status, NEW.status;
  END IF;
  
  return NEW;
end;
$function$;

-- Create the trigger
CREATE TRIGGER notify_project_planning_correction_trigger
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_planning_correction();