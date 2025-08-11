-- 1) Add project_number column and backfill sequential numbers starting from 1
BEGIN;

-- Add column nullable initially
ALTER TABLE public.manufacturing_projects
ADD COLUMN IF NOT EXISTS project_number BIGINT;

-- Backfill existing rows with sequential numbers ordered by created_at (oldest first)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM public.manufacturing_projects
),
updated AS (
  UPDATE public.manufacturing_projects p
  SET project_number = r.rn
  FROM ranked r
  WHERE p.id = r.id AND p.project_number IS NULL
  RETURNING 1
)
SELECT 1;

-- Create sequence and attach as default for future inserts
CREATE SEQUENCE IF NOT EXISTS public.manufacturing_projects_project_number_seq
  START WITH 1
  INCREMENT BY 1
  OWNED BY public.manufacturing_projects.project_number;

-- Set the sequence to max(current) so next insert gets max+1
SELECT setval('public.manufacturing_projects_project_number_seq', COALESCE((SELECT MAX(project_number) FROM public.manufacturing_projects), 0));

-- Set default to use the sequence for new rows
ALTER TABLE public.manufacturing_projects
ALTER COLUMN project_number SET DEFAULT nextval('public.manufacturing_projects_project_number_seq'::regclass);

-- Enforce constraints
ALTER TABLE public.manufacturing_projects
ALTER COLUMN project_number SET NOT NULL;

ALTER TABLE public.manufacturing_projects
ADD CONSTRAINT manufacturing_projects_project_number_unique UNIQUE (project_number);

COMMIT;