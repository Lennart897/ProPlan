-- Fix notify_project_approval to resolve get_user_role lookup and avoid crashes during intermediate 5-status updates
CREATE OR REPLACE FUNCTION public.notify_project_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_current_user_role text;
begin
  -- Send email when status changes to approved (5) from any non-approved status including 4
  -- BUT only if the user making the change is NOT in a planning role (to avoid emails during planning corrections)
  IF NEW.status = 5 AND (OLD.status IS NULL OR OLD.status != 5) THEN
    -- Get the role of the user making the change (schema-qualified to avoid search_path issues)
    SELECT public.get_user_role(auth.uid()) INTO v_current_user_role;
    
    RAISE LOG 'Project approval trigger: Project % status changed from % to 5 by user with role %', 
      NEW.project_number, OLD.status, v_current_user_role;
    
    -- Only send approval email if the user is NOT in a planning role
    -- This prevents approval emails when planning users correct and then the system auto-approves
    IF v_current_user_role NOT LIKE 'planung%' AND v_current_user_role != 'planung' THEN
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
        RAISE LOG 'Advisory lock acquired for project approval by non-planning user';
        
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

        RAISE LOG 'Sending project approval email for project % (non-planning approval)', NEW.project_number;
        
        BEGIN
          select net.http_post(v_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
          RAISE LOG 'Project approval email sent - Request ID: %', v_req_id;
        EXCEPTION WHEN OTHERS THEN
          RAISE LOG 'Project approval email failed: %', SQLERRM;
        END;
      ELSE
        RAISE LOG 'Could not acquire advisory lock for project approval on project %', NEW.project_number;
      END IF;
    ELSE
      RAISE LOG 'Skipping approval email - change made by planning user (role: %)', v_current_user_role;
    END IF;
  END IF;
  
  return NEW;
end;
$function$;

-- Adjust handle_planning_correction to avoid unintended auto-approval and ensure final status stays as requested
CREATE OR REPLACE FUNCTION public.handle_planning_correction(
  p_project_id uuid,
  p_gesamtmenge integer,
  p_standort_verteilung jsonb,
  p_status integer,
  p_rejection_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- 1) Update core data first (without touching status yet)
  UPDATE public.manufacturing_projects 
  SET 
    gesamtmenge = p_gesamtmenge,
    standort_verteilung = p_standort_verteilung,
    rejection_reason = p_rejection_reason,
    updated_at = now()
  WHERE id = p_project_id;

  -- 2) Reset approvals for this project
  DELETE FROM public.project_location_approvals 
  WHERE project_id = p_project_id;
  
  -- 3) Re-create required approvals from the (now updated) distribution
  PERFORM public.create_location_approvals_for_project(p_project_id);
  
  -- 4) Finally enforce the target status (e.g., back to SupplyChain = 3)
  UPDATE public.manufacturing_projects 
  SET status = p_status,
      updated_at = now()
  WHERE id = p_project_id;
  
  -- Log for debugging
  RAISE LOG 'handle_planning_correction executed: Project %, Final Status %, Reason: %', 
    p_project_id, p_status, p_rejection_reason;
END;
$function$;