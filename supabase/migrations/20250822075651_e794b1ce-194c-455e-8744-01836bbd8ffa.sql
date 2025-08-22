-- Fix the security definer view issue by removing the security_barrier property
-- and instead create proper RLS policies for the view

-- Drop the existing view
DROP VIEW IF EXISTS public.manufacturing_projects_with_status_label;

-- Recreate the view without security_barrier
CREATE OR REPLACE VIEW public.manufacturing_projects_with_status_label AS
SELECT 
  p.*,
  CASE
    WHEN p.status = 6 THEN 'Abgelehnt'
    WHEN p.status = 5 AND p.letzte_anlieferung < CURRENT_DATE THEN 'Abgeschlossen'
    WHEN p.status = 5 THEN 'Genehmigt'
    WHEN p.status = 7 THEN 'Abgeschlossen'
    WHEN p.status = 1 THEN 'Erfassung'
    WHEN p.status = 2 THEN 'Prüfung Vertrieb'
    WHEN p.status = 3 THEN 'Prüfung SupplyChain'
    WHEN p.status = 4 THEN 'Prüfung Planung Standort'
    ELSE 'Unbekannt'
  END as status_label,
  CASE
    WHEN p.status = 6 THEN 'bg-red-100 text-red-800'
    WHEN p.status = 5 AND p.letzte_anlieferung < CURRENT_DATE THEN 'bg-purple-100 text-purple-800'
    WHEN p.status = 5 THEN 'bg-green-100 text-green-800'
    WHEN p.status = 7 THEN 'bg-purple-100 text-purple-800'
    WHEN p.status = 1 THEN 'bg-slate-100 text-slate-800'
    WHEN p.status = 2 THEN 'bg-blue-100 text-blue-800'
    WHEN p.status = 3 THEN 'bg-yellow-100 text-yellow-800'
    WHEN p.status = 4 THEN 'bg-orange-100 text-orange-800'
    ELSE 'bg-gray-100 text-gray-800'
  END as status_color
FROM public.manufacturing_projects p;