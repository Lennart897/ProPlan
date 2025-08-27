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
  created: "Erstellt",
  submitted: "Eingereicht",
  approved: "Genehmigt",
  rejected: "Abgelehnt", 
  corrected: "Korrektur angefordert",
};

const actionColors = {
  created: "bg-blue-500",
  submitted: "bg-blue-500",
  approved: "bg-green-500",
  rejected: "bg-red-500",
  corrected: "bg-orange-500",
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
                    <div className={`rounded-full p-2 ${actionColors[entry.action as keyof typeof actionColors] || 'bg-gray-500'}`}>
                      <IconComponent className="h-4 w-4 text-white" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline">
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
                      
                      {entry.reason && (
                        <div className="bg-muted/50 rounded-lg p-3 mt-2">
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-sm font-medium mb-1">
                                {entry.action === 'rejected' ? 'Ablehnungsbegründung:' : 
                                 entry.action === 'corrected' ? 'Korrekturbegründung:' : 'Begründung:'}
                              </p>
                              <p className="text-sm text-muted-foreground">{entry.reason}</p>
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