import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Clock, User, Building, Package, Hash } from "lucide-react";

interface ActivityLogProps {
  userId: string;
  userRole: string;
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

type UserProfile = {
  user_id: string;
  display_name: string | null;
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
  correction: "Korrektur",
  corrected: "Korrigiert",
  archive: "Archiviert",
  send_to_progress: "Freigegeben",
};

const actionColors: Record<string, "default" | "secondary" | "destructive" | "outline" | "warning"> = {
  create: "default",
  approve: "default",
  approved_forwarded: "secondary",
  location_approved: "default",
  reject: "destructive",
  rejected: "destructive",
  correct: "secondary",
  correction: "warning",
  corrected: "secondary",
  archive: "outline",
  send_to_progress: "default",
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

export function ActivityLog({ userId, userRole }: ActivityLogProps) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [projects, setProjects] = useState<Record<string, ProjectMinimal>>({});
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
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

      // 2) Historie für sichtbare Projekte laden (Admin sieht alle, andere nur eigene)
      const historyQuery = supabase
        .from('project_history')
        .select('*')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .limit(200);
      
      // Alle Benutzer sehen ihre eigenen Aktivitäten, Admins sehen alle
      if (userRole !== 'admin') {
        historyQuery.eq('user_id', userId);
      }
      
      const { data: history, error } = await historyQuery;
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

      // 4) Benutzerprofile für Anzeigenamen laden
      const uniqueUserIds = Array.from(new Set((history as HistoryRow[]).map(h => h.user_id)));
      if (uniqueUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', uniqueUserIds);
        
        const profilesMap: Record<string, UserProfile> = {};
        (profiles || []).forEach((profile: any) => {
          profilesMap[profile.user_id] = {
            user_id: profile.user_id,
            display_name: profile.display_name,
          };
        });
        if (!isMounted) return;
        setUserProfiles(profilesMap);
      }
      
      setLoading(false);
    }
    load();
    return () => { isMounted = false; };
  }, [userId]);

  const formatted = useMemo(() => rows.map(r => ({
    ...r,
    project: projects[r.project_id],
    userDisplayName: userProfiles[r.user_id]?.display_name || r.user_name,
  })), [rows, projects, userProfiles]);

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
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Aktivitätenprotokoll
          <Badge variant="outline" className="ml-auto text-xs">
            {formatted.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative w-full h-[400px] overflow-auto border-t">
          <Table className="text-sm">
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <TableRow className="hover:bg-transparent border-b">
                <TableHead className="w-[90px] p-2">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span className="text-xs">Zeit</span>
                  </div>
                </TableHead>
                <TableHead className="w-[100px] p-2">
                  <span className="text-xs">Aktion</span>
                </TableHead>
                <TableHead className="w-[60px] p-2">
                  <div className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    <span className="text-xs hidden sm:inline">Nr.</span>
                  </div>
                </TableHead>
                <TableHead className="w-[100px] p-2">
                  <div className="flex items-center gap-1">
                    <Building className="h-3 w-3" />
                    <span className="text-xs">Kunde</span>
                  </div>
                </TableHead>
                <TableHead className="w-[80px] p-2 hidden md:table-cell">
                  <div className="flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    <span className="text-xs">Art.-Nr.</span>
                  </div>
                </TableHead>
                <TableHead className="w-[120px] p-2 hidden lg:table-cell">
                  <span className="text-xs">Artikel</span>
                </TableHead>
                <TableHead className="w-[70px] p-2">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span className="text-xs hidden sm:inline">User</span>
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
                  <TableCell className="font-mono text-xs text-muted-foreground p-2">
                    {new Date(row.created_at).toLocaleString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </TableCell>
                  <TableCell className="p-2">
                    <Badge 
                      variant={actionColors[row.action] || "outline"}
                      className="text-xs font-medium"
                    >
                      {actionLabels[row.action] || row.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold text-xs p-2">
                    {row.project?.project_number ?? '—'}
                  </TableCell>
                  <TableCell className="truncate text-xs p-2" title={row.project?.customer}>
                    {row.project?.customer ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs p-2 hidden md:table-cell">
                    {row.project?.artikel_nummer ?? '—'}
                  </TableCell>
                  <TableCell className="truncate text-xs p-2 hidden lg:table-cell" title={row.project?.artikel_bezeichnung}>
                    {row.project?.artikel_bezeichnung ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground p-2">
                    {row.userDisplayName}
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
