CREATE OR REPLACE VIEW public.manufacturing_projects_with_status_label
WITH (security_invoker = true)
AS
SELECT id,
    project_number,
    customer,
    artikel_nummer,
    artikel_bezeichnung,
    produktgruppe,
    produktgruppe_2,
    gesamtmenge,
    beschreibung,
    erste_anlieferung,
    letzte_anlieferung,
    status,
    created_at,
    updated_at,
    created_by_id,
    created_by_name,
    standort_verteilung,
    menge_fix,
    preis,
    rejection_reason,
    archived,
    archived_at,
    CASE
        WHEN (status = 6) THEN 'Abgelehnt'::text
        WHEN ((status = 5) AND (letzte_anlieferung < CURRENT_DATE)) THEN 'Abgeschlossen'::text
        WHEN (status = 5) THEN 'Genehmigt'::text
        WHEN (status = 7) THEN 'Abgeschlossen'::text
        WHEN (status = 1) THEN 'Erfassung'::text
        WHEN (status = 2) THEN 'Prüfung Vertrieb'::text
        WHEN (status = 3) THEN 'Prüfung SupplyChain'::text
        WHEN (status = 4) THEN 'Prüfung Planung'::text
        ELSE 'Unbekannt'::text
    END AS status_label,
    CASE
        WHEN (status = 6) THEN 'bg-red-100 text-red-800'::text
        WHEN ((status = 5) AND (letzte_anlieferung < CURRENT_DATE)) THEN 'bg-emerald-100 text-emerald-800'::text
        WHEN (status = 5) THEN 'bg-green-100 text-green-800'::text
        WHEN (status = 7) THEN 'bg-emerald-100 text-emerald-800'::text
        WHEN (status = 1) THEN 'bg-slate-100 text-slate-800'::text
        WHEN (status = 2) THEN 'bg-blue-100 text-blue-800'::text
        WHEN (status = 3) THEN 'bg-yellow-100 text-yellow-800'::text
        WHEN (status = 4) THEN 'bg-orange-100 text-orange-800'::text
        ELSE 'bg-gray-100 text-gray-800'::text
    END AS status_color
FROM manufacturing_projects p;