-- Allow project creators to reject approved projects (status 5 to 6)
CREATE OR REPLACE FUNCTION public.can_creator_reject_approved_project(user_uuid uuid, project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
DECLARE
  project_creator uuid;
  project_status int;
BEGIN
  -- Get project creator and status
  SELECT created_by_id, status INTO project_creator, project_status
  FROM public.manufacturing_projects
  WHERE id = project_id;
  
  -- Check if user is creator and project is approved (status 5)
  RETURN (project_creator = user_uuid AND project_status = 5);
END;
$$;

-- Update RLS policy to allow creators to reject approved projects
DROP POLICY IF EXISTS "Creators can update their own projects" ON public.manufacturing_projects;

CREATE POLICY "Creators can update their own projects" 
ON public.manufacturing_projects 
FOR UPDATE 
USING (
  (created_by_id = auth.uid()) OR 
  can_creator_reject_approved_project(auth.uid(), id)
)
WITH CHECK (
  (created_by_id = auth.uid()) OR 
  can_creator_reject_approved_project(auth.uid(), id)
);

-- Create edge function to send creator rejection notifications
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
begin
  v_current_user_id := auth.uid();
  
  RAISE LOG 'Creator rejection trigger fired: Project % status changed from % to %, User: %', 
    NEW.project_number, OLD.status, NEW.status, v_current_user_id;
  
  -- Only send email when creator changes status from 5 (approved) to 6 (rejected)
  IF OLD.status = 5 AND NEW.status = 6 AND NEW.created_by_id = v_current_user_id THEN
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
    RAISE LOG 'Creator rejection criteria not met. OLD: %, NEW: %, Creator: %, Current User: %', 
      OLD.status, NEW.status, NEW.created_by_id, v_current_user_id;
  END IF;
  
  return NEW;
end;
$$;

-- Create trigger for creator rejection notifications
DROP TRIGGER IF EXISTS trg_notify_creator_project_rejection ON public.manufacturing_projects;
CREATE TRIGGER trg_notify_creator_project_rejection
  AFTER UPDATE ON public.manufacturing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_creator_project_rejection();