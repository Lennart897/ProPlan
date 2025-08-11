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
      const { data: history, error } = await supabase
        .from('project_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        console.error('Fehler beim Laden des Aktivitätsprotokolls', error);
        setLoading(false);
        return;
      }
      if (!isMounted) return;
      setRows(history as HistoryRow[]);

      const ids = Array.from(new Set((history || []).map((h: any) => h.project_id)));
      if (ids.length) {
        const { data: projs } = await supabase
          .from('manufacturing_projects')
          .select('id, project_number, customer, artikel_nummer, artikel_bezeichnung')
          .in('id', ids);
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
      }
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
            <TableHead>Status alt → neu</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {formatted.map((row) => {
            const prev = row.previous_status ? (statusLabels[row.previous_status] || row.previous_status) : '—';
            const next = row.new_status ? (statusLabels[row.new_status] || row.new_status) : '—';
            return (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">{new Date(row.created_at).toLocaleString('de-DE')}</TableCell>
                <TableCell>
                  <Badge variant="outline">{actionLabels[row.action] || row.action}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.project?.project_number ?? '—'}</TableCell>
                <TableCell className="truncate max-w-[200px]">{row.project?.customer ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{row.project?.artikel_nummer ?? '—'}</TableCell>
                <TableCell className="truncate max-w-[280px]">{row.project?.artikel_bezeichnung ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{prev} → {next}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
