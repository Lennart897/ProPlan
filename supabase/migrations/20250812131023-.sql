-- Tighten UPDATE RLS on manufacturing_projects
begin;

-- Remove overly-permissive update policy
drop policy if exists "Authenticated users can update projects" on public.manufacturing_projects;

-- Allow admins to update any project
create policy "Admins can update all projects"
  on public.manufacturing_projects
  for update
  using (public.get_user_role(auth.uid()) = 'admin')
  with check (public.get_user_role(auth.uid()) = 'admin');

-- Allow supply_chain to update any project
create policy "Supply Chain can update all projects"
  on public.manufacturing_projects
  for update
  using (public.get_user_role(auth.uid()) = 'supply_chain')
  with check (public.get_user_role(auth.uid()) = 'supply_chain');

-- Allow creators to update their own projects
create policy "Creators can update their own projects"
  on public.manufacturing_projects
  for update
  using (created_by_id = auth.uid())
  with check (created_by_id = auth.uid());

commit;