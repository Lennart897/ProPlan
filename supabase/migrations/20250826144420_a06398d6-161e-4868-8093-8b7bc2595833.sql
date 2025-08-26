-- Update the trigger to use supabase.functions.invoke instead of net.http_post
DROP TRIGGER IF EXISTS trg_notify_project_correction ON public.manufacturing_projects;

CREATE OR REPLACE FUNCTION public.notify_project_correction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_payload jsonb;
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

      RAISE LOG 'History entry created, invoking edge function';

      -- Call the edge function directly using supabase internal function
      PERFORM 
        supabase_functions.invoke(
          'send-project-correction-email',
          v_payload::text::bytea
        );
        
      RAISE LOG 'Project correction email function invoked for project % by user %', NEW.project_number, v_current_user_id;
    ELSE
      RAISE LOG 'User role % is not supply_chain, email not sent', v_user_role;
    END IF;
  ELSE
    RAISE LOG 'Status change not matching criteria. OLD: %, NEW: %', OLD.status, NEW.status;
  END IF;
  
  return NEW;
end;
$function$;

-- Re-create the trigger
CREATE TRIGGER trg_notify_project_correction
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_correction();