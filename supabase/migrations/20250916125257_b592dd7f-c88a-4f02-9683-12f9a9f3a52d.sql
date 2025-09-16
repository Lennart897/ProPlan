-- Recreate view to include produktgruppe_2 so it shows up during project review
DROP VIEW IF EXISTS public.manufacturing_projects_with_status_label;

CREATE OR REPLACE VIEW public.manufacturing_projects_with_status_label AS
SELECT 
  p.id,
  p.project_number,
  p.customer,
  p.artikel_nummer,
  p.artikel_bezeichnung,
  p.produktgruppe,
  p.produktgruppe_2,
  p.gesamtmenge,
  p.beschreibung,
  p.erste_anlieferung,
  p.letzte_anlieferung,
  p.status,
  p.created_at,
  p.updated_at,
  p.created_by_id,
  p.created_by_name,
  p.standort_verteilung,
  p.menge_fix,
  p.preis,
  p.rejection_reason,
  p.archived,
  p.archived_at,
  -- Derived presentation fields
  CASE
    WHEN p.status = 6 THEN 'Abgelehnt'
    WHEN p.status = 5 AND p.letzte_anlieferung < CURRENT_DATE THEN 'Abgeschlossen'
    WHEN p.status = 5 THEN 'Genehmigt'
    WHEN p.status = 7 THEN 'Abgeschlossen'
    WHEN p.status = 1 THEN 'Erfassung'
    WHEN p.status = 2 THEN 'Prüfung Vertrieb'
    WHEN p.status = 3 THEN 'Prüfung SupplyChain'
    WHEN p.status = 4 THEN 'Prüfung Planung'
    ELSE 'Unbekannt'
  END AS status_label,
  CASE
    WHEN p.status = 6 THEN 'bg-red-100 text-red-800'
    WHEN p.status = 5 AND p.letzte_anlieferung < CURRENT_DATE THEN 'bg-emerald-100 text-emerald-800'
    WHEN p.status = 5 THEN 'bg-green-100 text-green-800'
    WHEN p.status = 7 THEN 'bg-emerald-100 text-emerald-800'
    WHEN p.status = 1 THEN 'bg-slate-100 text-slate-800'
    WHEN p.status = 2 THEN 'bg-blue-100 text-blue-800'
    WHEN p.status = 3 THEN 'bg-yellow-100 text-yellow-800'
    WHEN p.status = 4 THEN 'bg-orange-100 text-orange-800'
    ELSE 'bg-gray-100 text-gray-800'
  END AS status_color
FROM public.manufacturing_projects p;

GRANT SELECT ON public.manufacturing_projects_with_status_label TO authenticated;
GRANT SELECT ON public.manufacturing_projects_with_status_label TO anon;