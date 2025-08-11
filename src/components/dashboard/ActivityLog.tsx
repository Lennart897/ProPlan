import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ActivityLogProps {
  userId: string;
}

type HistoryRow = {
  id: string;
  project_id: string;
  user_id: string;
  user_name: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
};

type ProjectMinimal = {
  id: string;
  project_number: number | null;
  customer: string;
  artikel_nummer?: string;
  artikel_bezeichnung?: string;
};

const actionLabels: Record<string, string> = {
  create: "Erstellt",
  approve: "Zugesagt",
  reject: "Abgesagt",
  correct: "Korrigiert",
  archive: "Archiviert",
};

const statusLabels: Record<string, string> = {
  draft: "Entwurf",
  pending: "Ausstehend",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  in_progress: "In Bearbeitung",
  completed: "Abgeschlossen",
  archived: "Archiviert",
};

export function ActivityLog({ userId }: ActivityLogProps) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [projects, setProjects] = useState<Record<string, ProjectMinimal>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      // 1) Sichtbare Projekte laden (RLS bestimmt Sichtbarkeit)
      const { data: visibleProjects, error: projError } = await supabase
        .from('manufacturing_projects')
        .select('id');
      if (projError) {
        console.error('Fehler beim Laden der Projekte für Aktivitäten', projError);
        setLoading(false);
        return;
      }

      const projectIds = (visibleProjects || []).map((p: any) => p.id);
      if (projectIds.length === 0) {
        if (!isMounted) return;
        setRows([]);
        setProjects({});
        setLoading(false);
        return;
      }

      // 2) Historie für sichtbare Projekte laden
      const { data: history, error } = await supabase
        .from('project_history')
        .select('*')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        console.error('Fehler beim Laden des Aktivitätsprotokolls', error);
        setLoading(false);
        return;
      }
      if (!isMounted) return;
      setRows(history as HistoryRow[]);

      // 3) Projekt-Metadaten für Anzeige laden
      const { data: projs } = await supabase
        .from('manufacturing_projects')
        .select('id, project_number, customer, artikel_nummer, artikel_bezeichnung')
        .in('id', projectIds);
      const map: Record<string, ProjectMinimal> = {};
      (projs || []).forEach((p: any) => {
        map[p.id] = {
          id: p.id,
          project_number: p.project_number ?? null,
          customer: p.customer,
          artikel_nummer: p.artikel_nummer,
          artikel_bezeichnung: p.artikel_bezeichnung,
        };
      });
      if (!isMounted) return;
      setProjects(map);
      setLoading(false);
    }
    load();
    return () => { isMounted = false; };
  }, [userId]);

  const formatted = useMemo(() => rows.map(r => ({
    ...r,
    project: projects[r.project_id],
  })), [rows, projects]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Lade Aktivitäten...</CardContent>
      </Card>
    );
  }

  if (!formatted.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Keine Aktivitäten vorhanden</CardContent>
      </Card>
    );
  }

  return (
    <div className="relative w-full overflow-auto">
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow>
            <TableHead>Datum</TableHead>
            <TableHead>Aktion</TableHead>
            <TableHead>Projekt-Nr.</TableHead>
            <TableHead>Kunde</TableHead>
            <TableHead>Artikel-Nr.</TableHead>
            <TableHead>Artikel</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {formatted.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{new Date(row.created_at).toLocaleString('de-DE')}</TableCell>
              <TableCell>
                <Badge variant="outline">{actionLabels[row.action] || row.action}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">{row.project?.project_number ?? '—'}</TableCell>
              <TableCell className="truncate max-w-[200px]">{row.project?.customer ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap">{row.project?.artikel_nummer ?? '—'}</TableCell>
              <TableCell className="truncate max-w-[280px]">{row.project?.artikel_bezeichnung ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
