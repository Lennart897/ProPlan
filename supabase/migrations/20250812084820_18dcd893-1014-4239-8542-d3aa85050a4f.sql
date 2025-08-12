-- Create tasks table if it does not exist
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure the trigger function exists (uses Edge Function call)
CREATE OR REPLACE FUNCTION public.notify_task_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  PERFORM supabase_functions.http_request(
    'https://rhubaybwftyypfbiuoyc.functions.supabase.co/send-task-email',
    'POST',
    jsonb_build_object(
      'id', NEW.id,
      'title', NEW.title,
      'description', NEW.description,
      'assigned_to', NEW.assigned_to
    ),
    jsonb_build_object(
      'Content-Type', 'application/json'
    )
  );
  RETURN NEW;
END;
$function$;

-- Recreate trigger that fires after insert on tasks
DROP TRIGGER IF EXISTS trg_tasks_send_email ON public.tasks;
CREATE TRIGGER trg_tasks_send_email
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.notify_task_insert();