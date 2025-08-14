import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Clock, User, Building, Package, Hash } from "lucide-react";

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
  approved_forwarded: "Weitergeleitet (Supply Chain)",
  location_approved: "Standort zugesagt",
  reject: "Abgesagt",
  rejected: "Abgelehnt",
  correct: "Korrigiert",
  corrected: "Korrigiert",
  archive: "Archiviert",
};

const actionColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create: "default",
  approve: "default",
  approved_forwarded: "secondary",
  location_approved: "default",
  reject: "destructive",
  rejected: "destructive",
  correct: "secondary",
  corrected: "secondary",
  archive: "outline",
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
      <Card className="h-fit">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5" />
            Aktivitätenprotokoll
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!formatted.length) {
    return (
      <Card className="h-fit">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5" />
            Aktivitätenprotokoll
          </CardTitle>
        </CardHeader>
        <CardContent className="py-12">
          <div className="text-center">
            <Activity className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-sm">Keine Aktivitäten vorhanden</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Aktivitäten werden hier angezeigt, sobald Projekte erstellt oder bearbeitet werden.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-fit max-w-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5" />
          Aktivitätenprotokoll
          <Badge variant="outline" className="ml-auto text-xs">
            {formatted.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative w-full overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b">
                <TableHead className="w-[120px] min-w-[120px]">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Zeit
                  </div>
                </TableHead>
                <TableHead className="w-[130px] min-w-[130px]">Aktion</TableHead>
                <TableHead className="w-[80px] min-w-[80px]">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    Projekt
                  </div>
                </TableHead>
                <TableHead className="w-[150px] min-w-[150px]">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Kunde
                  </div>
                </TableHead>
                <TableHead className="w-[110px] min-w-[110px] hidden sm:table-cell">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Artikel-Nr.
                  </div>
                </TableHead>
                <TableHead className="min-w-[150px] hidden md:table-cell">Artikel</TableHead>
                <TableHead className="w-[90px] min-w-[90px]">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Nutzer
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formatted.map((row) => (
                <TableRow 
                  key={row.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={actionColors[row.action] || "outline"}
                      className="text-xs font-medium"
                    >
                      {actionLabels[row.action] || row.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {row.project?.project_number ?? '—'}
                  </TableCell>
                  <TableCell className="truncate max-w-[160px]" title={row.project?.customer}>
                    {row.project?.customer ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-sm hidden sm:table-cell">
                    {row.project?.artikel_nummer ?? '—'}
                  </TableCell>
                  <TableCell className="truncate max-w-[200px] hidden md:table-cell" title={row.project?.artikel_bezeichnung}>
                    {row.project?.artikel_bezeichnung ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.user_name}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
