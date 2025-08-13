-- Fix user deletion blocked by FK from manufacturing_projects.created_by_id
-- 1) Allow nulls on created_by_id so we can set it to NULL when the user is deleted
ALTER TABLE public.manufacturing_projects
  ALTER COLUMN created_by_id DROP NOT NULL;

-- 2) Replace the FK with ON DELETE SET NULL behavior
ALTER TABLE public.manufacturing_projects
  DROP CONSTRAINT IF EXISTS manufacturing_projects_created_by_id_fkey;

ALTER TABLE public.manufacturing_projects
  ADD CONSTRAINT manufacturing_projects_created_by_id_fkey
  FOREIGN KEY (created_by_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;