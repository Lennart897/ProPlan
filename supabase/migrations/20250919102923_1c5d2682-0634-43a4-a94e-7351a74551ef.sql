-- Allow all users to view their own activity history regardless of current project visibility
-- This complements the existing policy that allows viewing history for visible projects

-- Safety: drop if exists to avoid duplicates on repeated runs
DROP POLICY IF EXISTS "Users can view their own project history" ON public.project_history;

CREATE POLICY "Users can view their own project history"
ON public.project_history
FOR SELECT
USING (auth.uid() = user_id);
