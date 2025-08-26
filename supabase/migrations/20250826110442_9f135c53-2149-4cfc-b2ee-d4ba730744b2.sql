-- Create function to notify about project rejections (status 3 -> 6)
CREATE OR REPLACE FUNCTION public.notify_project_rejection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-project-rejection-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000;
  v_payload jsonb;
  v_req_id bigint;
  v_lock_key bigint;
  v_user_role text;
begin
  -- Only send email when status changes from 3 (Prüfung SupplyChain) to 6 (Abgelehnt)
  IF OLD.status = 3 AND NEW.status = 6 THEN
    -- Get the role of the user who made the change
    SELECT role INTO v_user_role FROM public.profiles WHERE user_id = auth.uid();
    
    -- Only proceed if the user has supply_chain role
    IF v_user_role = 'supply_chain' THEN
      -- Create a unique lock key based on project ID and timestamp
      v_lock_key := ('x' || md5(NEW.id::text || extract(epoch from now())::text))::bit(64)::bigint;
      
      -- Try to acquire an advisory lock to prevent duplicate executions
      IF pg_try_advisory_xact_lock(v_lock_key) THEN
        v_payload := jsonb_build_object(
          'id', NEW.id,
          'project_number', NEW.project_number,
          'customer', NEW.customer,
          'artikel_nummer', NEW.artikel_nummer,
          'artikel_bezeichnung', NEW.artikel_bezeichnung,
          'created_by_id', NEW.created_by_id,
          'created_by_name', NEW.created_by_name,
          'rejection_reason', NEW.rejection_reason
        );

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
          auth.uid(),
          (SELECT display_name FROM public.profiles WHERE user_id = auth.uid()),
          'Projekt von SupplyChain abgesagt - E-Mail versendet',
          'Prüfung SupplyChain',
          'Abgelehnt',
          NEW.rejection_reason
        );

        select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
        
        -- Log successful email trigger
        RAISE LOG 'Project rejection email triggered for project % by user %', NEW.project_number, auth.uid();
      END IF;
    END IF;
  END IF;
  
  return NEW;
end;
$function$;

-- Create trigger for project rejections
DROP TRIGGER IF EXISTS project_rejection_notification ON public.manufacturing_projects;
CREATE TRIGGER project_rejection_notification
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_rejection();