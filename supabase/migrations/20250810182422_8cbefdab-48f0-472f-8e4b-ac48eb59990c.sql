-- 1) Extend app_role enum with 'admin'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'admin';
  END IF;
END
$$;

-- 2) Ensure trigger to sync profiles on auth user creation exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END
$$;

-- 3) RLS policies to grant admins full access where appropriate

-- Profiles: allow admins to view and update all
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all profiles"
ON public.profiles
FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;
CREATE POLICY "Admin can update all profiles"
ON public.profiles
FOR UPDATE
USING (public.get_user_role(auth.uid()) = 'admin');

-- Projects: admin full access
DROP POLICY IF EXISTS "Admin can view all projects" ON public.projects;
CREATE POLICY "Admin can view all projects"
ON public.projects
FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admin can update all projects" ON public.projects;
CREATE POLICY "Admin can update all projects"
ON public.projects
FOR UPDATE
USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admin can insert any project" ON public.projects;
CREATE POLICY "Admin can insert any project"
ON public.projects
FOR INSERT
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admin can delete any project" ON public.projects;
CREATE POLICY "Admin can delete any project"
ON public.projects
FOR DELETE
USING (public.get_user_role(auth.uid()) = 'admin');

-- Tasks: admin full access
DROP POLICY IF EXISTS "Admin can view all tasks" ON public.tasks;
CREATE POLICY "Admin can view all tasks"
ON public.tasks
FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admin can update all tasks" ON public.tasks;
CREATE POLICY "Admin can update all tasks"
ON public.tasks
FOR UPDATE
USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admin can insert any task" ON public.tasks;
CREATE POLICY "Admin can insert any task"
ON public.tasks
FOR INSERT
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admin can delete any task" ON public.tasks;
CREATE POLICY "Admin can delete any task"
ON public.tasks
FOR DELETE
USING (public.get_user_role(auth.uid()) = 'admin');

-- Manufacturing projects: add delete for admin (others already broad)
DROP POLICY IF EXISTS "Admin can delete any manufacturing_project" ON public.manufacturing_projects;
CREATE POLICY "Admin can delete any manufacturing_project"
ON public.manufacturing_projects
FOR DELETE
USING (public.get_user_role(auth.uid()) = 'admin');