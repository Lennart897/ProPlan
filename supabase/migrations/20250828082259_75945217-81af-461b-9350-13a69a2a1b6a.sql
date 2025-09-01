-- Problem identifiziert: Doppelter E-Mail-Versand durch redundante Trigger
-- Der notify_project_rejection() Trigger ruft ZWEI verschiedene Edge Functions auf:
-- 1. send-project-rejection-email (für 3->6 Status)
-- 2. send-project-rejection-supply-chain-email (für 5->6 Status)
-- PLUS der separate notify_creator_project_rejection() Trigger für Creator-Ablehnungen
-- Das führt zu doppelten E-Mails

-- Lösung: Den notify_project_rejection() Trigger vereinfachen und nur EINE URL verwenden
-- Die send-project-rejection-supply-chain-email Function kann beide Fälle abdecken

CREATE OR REPLACE FUNCTION public.notify_project_rejection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_supply_chain_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-project-rejection-supply-chain-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000;
  v_payload jsonb;
  v_req_id bigint;
  v_lock_key bigint;
  v_user_role text;
  v_current_user_id uuid;
  v_notification_exists boolean;
begin
  -- Get current user ID and role
  v_current_user_id := auth.uid();
  
  -- Log the trigger activation
  RAISE LOG 'Project rejection trigger activated. Project ID: %, OLD status: %, NEW status: %, User ID: %', 
    NEW.id, OLD.status, NEW.status, v_current_user_id;
  
  -- Handle rejection ONLY from status 3 (Prüfung SupplyChain) to 6 (Abgelehnt)
  -- Remove the 5->6 case to avoid duplication with creator rejection
  IF OLD.status = 3 AND NEW.status = 6 THEN
    RAISE LOG 'Status change detected from 3 to 6 for project %', NEW.project_number;
    
    -- Get the role of the user who made the change
    SELECT role INTO v_user_role FROM public.profiles WHERE user_id = v_current_user_id;
    
    RAISE LOG 'User role: % for user %', v_user_role, v_current_user_id;
    
    -- Only proceed if the user has supply_chain role
    IF v_user_role = 'supply_chain' THEN
      -- Check for duplicates
      SELECT EXISTS(
        SELECT 1 FROM public.email_notifications 
        WHERE project_id = NEW.id 
          AND notification_type = 'supply_chain_rejection'
          AND project_status = NEW.status
          AND rejection_reason = NEW.rejection_reason
          AND created_at > now() - interval '5 minutes'
      ) INTO v_notification_exists;
      
      IF v_notification_exists THEN
        RAISE LOG 'Duplicate supply chain rejection notification detected for project % - skipping email', NEW.project_number;
        RETURN NEW;
      END IF;
      
      RAISE LOG 'Supply chain user confirmed, proceeding with email notification';
      
      -- Create a unique lock key based on project ID and timestamp
      v_lock_key := ('x' || md5(NEW.id::text || NEW.rejection_reason))::bit(64)::bigint;
      
      -- Try to acquire an advisory lock to prevent duplicate executions
      IF pg_try_advisory_xact_lock(v_lock_key) THEN
        RAISE LOG 'Advisory lock acquired, building payload';
        
        -- Record notification
        INSERT INTO public.email_notifications (
          project_id, 
          notification_type, 
          user_id, 
          email_address, 
          project_status, 
          rejection_reason
        ) VALUES (
          NEW.id,
          'supply_chain_rejection',
          v_current_user_id,
          'supply_chain_rejection@placeholder.com',
          NEW.status,
          NEW.rejection_reason
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
          'created_by_name', NEW.created_by_name,
          'rejection_reason', NEW.rejection_reason
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
          'Projekt von SupplyChain abgesagt - E-Mail versendet',
          'Prüfung SupplyChain',
          'Abgelehnt',
          NEW.rejection_reason
        );

        RAISE LOG 'History entry created, sending HTTP request';

        -- Use supply chain URL for both creator and project creator notifications
        select net.http_post(v_supply_chain_url, v_payload, v_params, v_headers, v_timeout) into v_req_id;
        
        -- Log successful email trigger
        RAISE LOG 'Project rejection email triggered for project % by user %, request ID: %', NEW.project_number, v_current_user_id, v_req_id;
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