-- Fix creator rejection issues
-- This migration addresses the problem where project creators cannot reject approved projects

-- Update the function to handle both created_by_id (UUID) and created_by (string) fields
CREATE OR REPLACE FUNCTION public.can_creator_reject_approved_project(user_uuid uuid, project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
DECLARE
  project_creator_id uuid;
  project_creator_string text;
  project_status int;
  user_id_string text;
BEGIN
  -- Get project creator fields and status
  SELECT created_by_id, created_by, status 
  INTO project_creator_id, project_creator_string, project_status
  FROM public.manufacturing_projects
  WHERE id = project_id;
  
  -- Convert user UUID to string for comparison with created_by field
  user_id_string := user_uuid::text;
  
  -- Check if user is creator (either by UUID or string) and project is approved (status 5)
  RETURN (
    (project_creator_id = user_uuid OR project_creator_string = user_id_string) 
    AND project_status = 5
  );
END;
$$;

-- Update RLS policy to handle both created_by_id and created_by fields
DROP POLICY IF EXISTS "Creators can update their own projects" ON public.manufacturing_projects;

CREATE POLICY "Creators can update their own projects" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (
  (created_by_id = auth.uid()) OR 
  (created_by = auth.uid()::text) OR 
  can_creator_reject_approved_project(auth.uid(), id)
)
WITH CHECK (
  (created_by_id = auth.uid()) OR 
  (created_by = auth.uid()::text) OR 
  can_creator_reject_approved_project(auth.uid(), id)
);

-- Update the creator rejection trigger to also handle created_by field
CREATE OR REPLACE FUNCTION public.notify_creator_project_rejection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_url text := 'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-creator-rejection-email';
  v_headers jsonb := jsonb_build_object('Content-Type','application/json');
  v_params jsonb := '{}'::jsonb;
  v_timeout int := 5000;
  v_payload jsonb;
  v_req_id bigint;
  v_lock_key bigint;
  v_current_user_id uuid;
  v_rejected_by_name text;
  v_is_creator boolean := false;
begin
  v_current_user_id := auth.uid();
  
  RAISE LOG 'Creator rejection trigger fired: Project % status changed from % to %, User: %', 
    NEW.project_number, OLD.status, NEW.status, v_current_user_id;
  
  -- Check if current user is the creator (handle both created_by_id and created_by)
  v_is_creator := (
    NEW.created_by_id = v_current_user_id OR 
    NEW.created_by = v_current_user_id::text
  );
  
  -- Only send email when creator changes status from 5 (approved) to 6 (rejected)
  IF OLD.status = 5 AND NEW.status = 6 AND v_is_creator THEN
    RAISE LOG 'Creator rejection detected for project %', NEW.project_number;
    
    -- Create a unique lock key
    v_lock_key := ('x' || md5(NEW.id::text || 'creator_rejection' || extract(epoch from now())::text))::bit(64)::bigint;
    
    -- Try to acquire an advisory lock
    IF pg_try_advisory_xact_lock(v_lock_key) THEN
      RAISE LOG 'Advisory lock acquired for creator rejection';
      
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
        'rejected_by_id', v_current_user_id,
        'rejected_by_name', COALESCE(v_rejected_by_name, 'Projektersteller'),
        'rejection_reason', NEW.rejection_reason
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
    RAISE LOG 'Creator rejection criteria not met. OLD: %, NEW: %, Creator check: %, Current User: %', 
      OLD.status, NEW.status, v_is_creator, v_current_user_id;
  END IF;
  
  return NEW;
end;
$$;