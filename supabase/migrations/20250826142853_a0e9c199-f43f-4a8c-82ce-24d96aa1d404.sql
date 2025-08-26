-- Create a trigger function for project correction notifications
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
  
  -- Log the trigger activation
  RAISE LOG 'Project correction trigger activated. Project ID: %, OLD status: %, NEW status: %, User ID: %', 
    NEW.id, OLD.status, NEW.status, v_current_user_id;
  
  -- Only send email when status changes from 3 (Prüfung SupplyChain) to 2 (Prüfung Vertrieb)
  IF OLD.status = 3 AND NEW.status = 2 THEN
    RAISE LOG 'Status change detected from 3 to 2 for project %', NEW.project_number;
    
    -- Get the role of the user who made the change
    SELECT role INTO v_user_role FROM public.profiles WHERE user_id = v_current_user_id;
    
    RAISE LOG 'User role: % for user %', v_user_role, v_current_user_id;
    
    -- Only proceed if the user has supply_chain role
    IF v_user_role = 'supply_chain' THEN
      RAISE LOG 'Supply chain user confirmed, proceeding with correction email notification';
      
      -- Create a unique lock key based on project ID and timestamp
      v_lock_key := ('x' || md5(NEW.id::text || extract(epoch from now())::text))::bit(64)::bigint;
      
      -- Try to acquire an advisory lock to prevent duplicate executions
      IF pg_try_advisory_xact_lock(v_lock_key) THEN
        RAISE LOG 'Advisory lock acquired, building payload';
        
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

        RAISE LOG 'Payload built: %', v_payload;

        -- Log the action
        INSERT INTO public.project_history (
          project_id,
          user_id,
          user_name,
          action,
          previous_status,
          new_status,
          reason
        ) VALUES (
          NEW.id,
          v_current_user_id,
          (SELECT display_name FROM public.profiles WHERE user_id = v_current_user_id),
          'Projekt von SupplyChain korrigiert - E-Mail an Erfasser versendet',
          'Prüfung SupplyChain',
          'Prüfung Vertrieb',
          NEW.rejection_reason
        );

        RAISE LOG 'History entry created, sending HTTP request';

        select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
        
        -- Log successful email trigger
        RAISE LOG 'Project correction email triggered for project % by user %, request ID: %', NEW.project_number, v_current_user_id, v_req_id;
      ELSE
        RAISE LOG 'Could not acquire advisory lock for project %', NEW.project_number;
      END IF;
    ELSE
      RAISE LOG 'User role % is not supply_chain, email not sent', v_user_role;
    END IF;
  ELSE
    RAISE LOG 'Status change not matching criteria. OLD: %, NEW: %', OLD.status, NEW.status;
  END IF;
  
  return NEW;
end;
$function$;

-- Create trigger for project correction notifications
CREATE OR REPLACE TRIGGER trg_notify_project_correction
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_correction();