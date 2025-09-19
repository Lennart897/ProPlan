import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User, FileText, CheckCircle, XCircle, Edit, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStatusLabel } from "@/utils/statusUtils";

interface HistoryEntry {
  id: string;
  user_id: string;
  action: string;
  user_name: string;
  reason?: string;
  previous_status?: string;
  new_status?: string;
  created_at: string;
  old_data?: string;
  new_data?: string;
}

interface UserProfile {
  user_id: string;
  display_name: string;
  role: string;
}

interface ProjectHistoryProps {
  projectId: string;
}

const actionIcons = {
  created: Send,
  submitted: Send,
  approved: CheckCircle,
  rejected: XCircle,
  corrected: Edit,
};

const actionLabels = {
  create: "Erstellt",
  created: "Erstellt",
  approve: "Zugesagt",
  approved: "Genehmigt",
  approved_forwarded: "Weitergeleitet (Supply Chain)",
  location_approved: "Standort zugesagt",
  reject: "Abgesagt",
  rejected: "Abgelehnt",
  correct: "Korrigiert",
  correction: "Korrektur",
  corrected: "Korrigiert",
  archive: "Archiviert",
  send_to_progress: "Freigegeben",
  submitted: "Eingereicht",
};

const actionColors = {
  create: "default",
  created: "default",
  approve: "default",
  approved: "default",
  approved_forwarded: "secondary",
  location_approved: "default",
  reject: "destructive",
  rejected: "destructive",
  correct: "secondary",
  correction: "warning",
  corrected: "secondary",
  archive: "outline",
  send_to_progress: "default",
  submitted: "default",
};

const roleLabels = {
  admin: "Administrator",
  supply_chain: "SupplyChain", 
  vertrieb: "Vertrieb",
  planung: "Planung",
  planung_storkow: "Planung Storkow",
  planung_brenz: "Planung Brenz",
  planung_gudensberg: "Planung Gudensberg", 
  planung_doebeln: "Planung Döbeln",
  planung_visbek: "Planung Visbek",
};

const roleColors = {
  admin: "bg-purple-100 text-purple-800 border-purple-200",
  supply_chain: "bg-yellow-100 text-yellow-800 border-yellow-200",
  vertrieb: "bg-blue-100 text-blue-800 border-blue-200", 
  planung: "bg-orange-100 text-orange-800 border-orange-200",
  planung_storkow: "bg-orange-100 text-orange-800 border-orange-200",
  planung_brenz: "bg-orange-100 text-orange-800 border-orange-200",
  planung_gudensberg: "bg-orange-100 text-orange-800 border-orange-200",
  planung_doebeln: "bg-orange-100 text-orange-800 border-orange-200", 
  planung_visbek: "bg-orange-100 text-orange-800 border-orange-200",
};


export const ProjectHistory = ({ projectId }: ProjectHistoryProps) => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('project_history')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const historyData = (data || []) as HistoryEntry[];
        setHistory(historyData);

        const userIds = Array.from(new Set(historyData.map((h) => h.user_id).filter(Boolean)));
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('user_id, display_name, role')
            .in('user_id', userIds);

          if (!profilesError && profilesData) {
            const nameMap: Record<string, string> = {};
            const roleMap: Record<string, string> = {};
            profilesData.forEach((p: UserProfile) => {
              if (p.user_id && p.display_name) nameMap[p.user_id] = p.display_name;
              if (p.user_id && p.role) {
                roleMap[p.user_id] = p.role;
              }
            });
            setDisplayNames(nameMap);
            setUserRoles(roleMap);
          }
        }
      } catch (error) {
        console.error('Error fetching project history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('project-history-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_history',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          setHistory(prev => [payload.new as HistoryEntry, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Projektprotokoll
          </CardTitle>
          <CardDescription>Laden...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Projektprotokoll
        </CardTitle>
        <CardDescription>
          Chronologische Übersicht aller Aktionen und Entscheidungen
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Keine Protokolleinträge vorhanden.
          </p>
        ) : (
          <div className="space-y-4">
            {history.map((entry, index) => {
              const IconComponent = actionIcons[entry.action as keyof typeof actionIcons] || FileText;
              const isLastEntry = index === history.length - 1;
              
              return (
                <div key={entry.id} className="relative">
                  {/* Timeline line */}
                  {!isLastEntry && (
                    <div className="absolute left-4 top-10 w-0.5 h-16 bg-border" />
                  )}
                  
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="rounded-full p-2 bg-primary">
                      <IconComponent className="h-4 w-4 text-primary-foreground" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant={actionColors[entry.action as keyof typeof actionColors] as any || "outline"}>
                          {actionLabels[entry.action as keyof typeof actionLabels] || entry.action}
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className={
                            userRoles[entry.user_id] 
                              ? (roleColors[userRoles[entry.user_id] as keyof typeof roleColors] || "bg-gray-100 text-gray-800 border-gray-200")
                              : "bg-gray-100 text-gray-800 border-gray-200"
                          }
                        >
                           {(() => {
                             const role = userRoles[entry.user_id];
                             if (role) {
                               return roleLabels[role as keyof typeof roleLabels] || role;
                             }
                             return "Unbekannte Rolle";
                           })()}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString("de-DE", {
                            day: "2-digit",
                            month: "2-digit", 
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{displayNames[entry.user_id] || entry.user_name}</span>
                      </div>
                      
                      {entry.previous_status && entry.new_status && (
                        <div className="text-sm text-muted-foreground mb-2">
                          Status geändert: <span className="font-medium">
                            {(() => {
                              const prevStatus = parseInt(entry.previous_status);
                              return !isNaN(prevStatus) ? getStatusLabel(prevStatus) : entry.previous_status;
                            })()}
                          </span> → <span className="font-medium">
                            {(() => {
                              const newStatus = parseInt(entry.new_status);
                              return !isNaN(newStatus) ? getStatusLabel(newStatus) : entry.new_status;
                            })()}
                          </span>
                        </div>
                      )}
                      
                      {(entry.reason || (entry.action === 'correction' && (entry.old_data || entry.new_data))) && (
                        <div className="bg-muted/50 rounded-lg p-3 mt-2">
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div className="w-full">
                              {entry.action === 'correction' && (entry.old_data || entry.new_data) && (
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-sm font-medium mb-2">Korrektur der Projektdaten:</p>
                                    {(() => {
                                      try {
                                        const oldData = entry.old_data ? JSON.parse(entry.old_data) : null;
                                        const newData = entry.new_data ? JSON.parse(entry.new_data) : null;
                                        
                                        return (
                                          <div className="space-y-2 text-sm">
                                            {oldData?.gesamtmenge !== undefined && newData?.gesamtmenge !== undefined && oldData.gesamtmenge !== newData.gesamtmenge && (
                                              <div className="bg-blue-50 border border-blue-200 rounded p-2">
                                                <div className="font-medium text-blue-900 mb-1">Gesamtmenge korrigiert:</div>
                                                <div className="text-blue-800">
                                                  Ursprünglich angefragt: <span className="font-semibold">{oldData.gesamtmenge.toLocaleString()} kg</span>
                                                </div>
                                                <div className="text-blue-800">
                                                  Korrigiert auf: <span className="font-semibold text-green-700">{newData.gesamtmenge.toLocaleString()} kg</span>
                                                </div>
                                              </div>
                                            )}
                                            {oldData?.standort_verteilung && newData?.standort_verteilung && JSON.stringify(oldData.standort_verteilung) !== JSON.stringify(newData.standort_verteilung) && (
                                              <div className="bg-orange-50 border border-orange-200 rounded p-2">
                                                <div className="font-medium text-orange-900 mb-1">Standortverteilung geändert:</div>
                                                <div className="space-y-1">
                                                  {Object.entries(newData.standort_verteilung as Record<string, number>).map(([location, newQty]) => {
                                                    const oldQty = (oldData.standort_verteilung as Record<string, number>)?.[location] || 0;
                                                    if (oldQty !== newQty) {
                                                      return (
                                                        <div key={location} className="text-orange-800">
                                                          <span className="font-medium">{location}:</span> {oldQty.toLocaleString()} kg → <span className="font-semibold">{newQty.toLocaleString()} kg</span>
                                                        </div>
                                                      );
                                                    }
                                                    return null;
                                                  })}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      } catch (e) {
                                        return <p className="text-sm text-muted-foreground">Änderungsdetails nicht verfügbar</p>;
                                      }
                                    })()}
                                  </div>
                                </div>
                              )}
                              
                              {entry.reason && (
                                <div className="mt-3">
                                  <p className="text-sm font-medium mb-1">
                                    {entry.action === 'rejected' ? 'Ablehnungsbegründung:' : 
                                     entry.action === 'correction' ? 'Begründung der Korrektur:' :
                                     entry.action === 'approve' ? 'Kommentar zur Genehmigung:' : 'Begründung:'}
                                  </p>
                                  <p className="text-sm text-muted-foreground">{entry.reason}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};