-- Temporäre Lösung: RLS für manufacturing_projects deaktivieren für Tests
ALTER TABLE public.manufacturing_projects DISABLE ROW LEVEL SECURITY;