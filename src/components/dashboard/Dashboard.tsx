import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Filter, Search, Bell, User, LogOut, Calendar, Archive, ArrowLeft, Building2, Package, Scale } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectForm } from "./ProjectForm";
import { ProjectDetails } from "./ProjectDetails";
import { WeeklyCalendar } from "./WeeklyCalendar";

// Import the Project type from WeeklyCalendar to avoid type conflicts
type CalendarProject = {
  id: string;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  produktgruppe?: string;
  gesamtmenge: number;
  beschreibung?: string;
  erste_anlieferung?: string;
  letzte_anlieferung?: string;
  status: "draft" | "pending" | "approved" | "rejected" | "in_progress" | "completed" | "archived";
  created_at: string;
  updated_at: string;
  created_by_id: string;
  created_by_name: string;
  standort_verteilung?: Record<string, number>;
  menge_fix: boolean;
};
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme/theme-toggle";

interface Project {
  id: string;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  produktgruppe?: string;
  gesamtmenge: number;
  beschreibung?: string;
  erste_anlieferung?: string;
  letzte_anlieferung?: string;
  status: "draft" | "pending" | "approved" | "rejected" | "in_progress" | "completed" | "archived";
  created_at: string;
  created_by: string;
  standort_verteilung?: Record<string, number>;
  menge_fix?: boolean;
}

interface User {
  id: string;
  email: string;
  role: "vertrieb" | "supply_chain" | "planung" | "planung_storkow" | "planung_brenz" | "planung_gudensberg" | "planung_doebeln" | "planung_visbek" | "admin";
  full_name?: string;
}

const mockProjects: Project[] = [
  {
    id: "1",
    customer: "BMW AG",
    artikel_nummer: "ART-001",
    artikel_bezeichnung: "Hochwertige Metallkomponente",
    gesamtmenge: 1000,
    status: "pending",
    created_at: "2024-01-15T10:00:00Z",
    created_by: "Max Mustermann",
    standort_verteilung: {
      gudensberg: 300,
      brenz: 250,
      storkow: 200,
      visbek: 150,
      doebeln: 100
    },
    menge_fix: false
  },
  {
    id: "2", 
    customer: "Siemens AG",
    artikel_nummer: "ART-002",
    artikel_bezeichnung: "Elektronikbaugruppe",
    gesamtmenge: 500,
    status: "approved",
    created_at: "2024-01-14T15:30:00Z",
    created_by: "Anna Schmidt",
    standort_verteilung: {
      gudensberg: 200,
      brenz: 150,
      storkow: 100,
      visbek: 50,
      doebeln: 0
    },
    menge_fix: true
  },
];

const statusColors = {
  draft: "bg-gray-500",
  pending: "bg-warning",
  approved: "bg-success",
  rejected: "bg-destructive",
  in_progress: "bg-warning",
  completed: "bg-primary",
  archived: "bg-muted"
};

const statusLabels = {
  draft: "Entwurf",
  pending: "Ausstehend",
  approved: "Genehmigt", 
  rejected: "Abgelehnt",
  in_progress: "In Bearbeitung",
  completed: "Abgeschlossen",
  archived: "Archiviert"
};

interface DashboardProps {
  user: User;
  onSignOut: () => void;
}

export const Dashboard = ({ user, onSignOut }: DashboardProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [previewProject, setPreviewProject] = useState<CalendarProject | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [cameFromCalendar, setCameFromCalendar] = useState(false);
  const [calendarWeek, setCalendarWeek] = useState<Date>(new Date());
  const [archivedPrevStatus, setArchivedPrevStatus] = useState<Record<string, Project['status']>>({});
  const { toast } = useToast();

  // Load projects from database
  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('manufacturing_projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const formattedProjects: Project[] = data?.map(project => ({
        id: project.id,
        customer: project.customer,
        artikel_nummer: project.artikel_nummer,
        artikel_bezeichnung: project.artikel_bezeichnung,
        produktgruppe: project.produktgruppe,
        gesamtmenge: project.gesamtmenge,
        beschreibung: project.beschreibung,
        erste_anlieferung: project.erste_anlieferung,
        letzte_anlieferung: project.letzte_anlieferung,
        status: project.status as Project['status'],
        created_at: project.created_at,
        created_by: project.created_by_name,
        standort_verteilung: project.standort_verteilung as Record<string, number> | undefined,
        menge_fix: project.menge_fix
      })) || [];
      
      // Für Archivansicht: Vorherigen Status (vor Archivierung) laden
      try {
        const archivedIds = formattedProjects.filter(p => p.status === "archived").map(p => p.id);
        if (archivedIds.length > 0) {
          const { data: historyRows, error: histError } = await supabase
            .from('project_history')
            .select('project_id, previous_status, new_status, created_at')
            .in('project_id', archivedIds)
            .eq('new_status', 'archived')
            .order('created_at', { ascending: false });
          if (histError) throw histError;
          const map: Record<string, Project['status']> = {};
          const seen = new Set<string>();
          (historyRows || []).forEach((row: any) => {
            if (!seen.has(row.project_id)) {
              map[row.project_id] = row.previous_status as Project['status'];
              seen.add(row.project_id);
            }
          });
          setArchivedPrevStatus(map);
        } else {
          setArchivedPrevStatus({});
        }
      } catch (e) {
        console.error('Fehler beim Laden des Archiv-Statusverlaufs', e);
        setArchivedPrevStatus({});
      }
      
      setProjects(formattedProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
      toast({
        title: "Fehler",
        description: "Projekte konnten nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.artikel_nummer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.artikel_bezeichnung.toLowerCase().includes(searchTerm.toLowerCase());
    const isArchiveView = statusFilter === "archived";
    const matchesStatus = isArchiveView
      ? project.status === "archived"
      : (statusFilter === "all" ? project.status !== "archived" : project.status === statusFilter);
    
    // Rollenbasierte Filterung: nur relevante Projekte für die eigene Rolle anzeigen
    const matchesRole = () => {
      switch (user.role) {
        case "supply_chain":
          return project.status === "pending"; // SupplyChain sieht nur Projekte zur ersten Prüfung
        case "planung":
        case "planung_storkow":
        case "planung_brenz":
        case "planung_gudensberg":
        case "planung_doebeln":
        case "planung_visbek":
          return project.status === "in_progress"; // Planung sieht nur von SupplyChain weitergeleitete Projekte
        case "vertrieb":
          return true; // Vertrieb sieht alle Projekte (Überwachung)
        default:
          return true;
      }
    };
    
    return matchesSearch && matchesStatus && matchesRole();
  });

  const handleProjectAction = async (projectId: string, action: string) => {
    try {
      let newStatus = projects.find(p => p.id === projectId)?.status;
      
      switch (action) {
        case "approve":
          // SupplyChain approval → in_progress, Planung approval → approved
          const project = projects.find(p => p.id === projectId);
          if (project?.status === "pending" && user.role === "supply_chain") {
            newStatus = "in_progress";
          } else if (project?.status === "in_progress" && (
            user.role === "planung" || 
            user.role.startsWith("planung_")
          )) {
            newStatus = "approved";
          }
          break;
        case "reject":
          newStatus = "rejected";
          break;
        case "correct":
          // Go back one step
          const currentProject = projects.find(p => p.id === projectId);
          if (currentProject?.status === "in_progress") {
            newStatus = "pending"; // Back to SupplyChain
          }
          break;
        case "preview_calendar":
          console.log('Preview calendar action triggered for project:', projectId);
          // Set preview project and show calendar
          const projectToPreview = projects.find(p => p.id === projectId);
          console.log('Found project to preview:', projectToPreview);
          if (projectToPreview) {
            // Convert project format to match WeeklyCalendar expectations
            const previewProjectForCalendar: CalendarProject = {
              ...projectToPreview,
              updated_at: projectToPreview.created_at,
              created_by_id: 'preview',
              created_by_name: projectToPreview.created_by,
              erste_anlieferung: projectToPreview.erste_anlieferung || null,
              letzte_anlieferung: projectToPreview.letzte_anlieferung || null,
              menge_fix: projectToPreview.menge_fix || false
            };
            console.log('Setting preview project and showing calendar');
            setPreviewProject(previewProjectForCalendar);
            setShowCalendar(true);
            // Keep selectedProject so we can return to project details
          }
          return; // Exit early, don't update status
        case "archive":
          // Vertrieb kann genehmigte oder abgelehnte Projekte archivieren
          if (user.role === "vertrieb") {
            const currentProject = projects.find(p => p.id === projectId);
            if (currentProject && (currentProject.status === "approved" || currentProject.status === "rejected")) {
              newStatus = "archived";
            }
          }
          break;
        default:
          break;
      }

      if (newStatus) {
        // Wenn Archivierung, Historie speichern (vorheriger Status)
        if (action === "archive" && newStatus === "archived") {
          const prevStatus = projects.find(p => p.id === projectId)?.status;
          try {
            const { error: histError } = await supabase
              .from('project_history')
              .insert({
                project_id: projectId,
                user_id: user.id,
                user_name: user.full_name || user.email,
                action: 'archive',
                previous_status: prevStatus,
                new_status: 'archived',
              });
            if (histError) console.error('Projekt-Historie Fehler:', histError);
          } catch (e) {
            console.error('Projekt-Historie Ausnahme:', e);
          }
        }

        const { error } = await supabase
          .from('manufacturing_projects')
          .update({ status: newStatus })
          .eq('id', projectId);

        if (error) throw error;

        // Reload projects to get fresh data
        await loadProjects();
        
        toast({
          title: "Erfolgreich",
          description: "Projektstatus wurde aktualisiert",
        });
      }
    } catch (error) {
      console.error('Error updating project:', error);
      toast({
        title: "Fehler",
        description: "Projektstatus konnte nicht aktualisiert werden",
        variant: "destructive"
      });
    }
  };

  const getCurrentResponsibleRole = (status: Project['status']) => {
    switch (status) {
      case "draft":
        return "Vertrieb";
      case "pending":
        return "Supply Chain";
      case "approved":
        return "Planung (standortspezifisch)";
      case "rejected":
        return "Vertrieb";
      case "in_progress":
        return "Planung (standortspezifisch)";
      case "completed":
        return null;
      default:
        return "Unbekannt";
    }
  };

  const getActionsForRole = (project: Project) => {
    return (
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setSelectedProject(project)}>
          Prüfen
        </Button>
      </div>
    );
  };

const roleLabel = {
  vertrieb: "Vertrieb",
  supply_chain: "Supply Chain",
  planung: "Planung",
  planung_storkow: "Planung Storkow",
  planung_brenz: "Planung Brenz", 
  planung_gudensberg: "Planung Gudensberg",
  planung_doebeln: "Planung Döbeln",
  planung_visbek: "Planung Visbek",
  admin: "Admin"
};

  if (showProjectForm) {
    return (
      <div className="min-h-screen bg-background p-6">
        <ProjectForm
          user={user}
          onSuccess={() => {
            setShowProjectForm(false);
            loadProjects(); // Reload projects after creating new one
          }}
          onCancel={() => setShowProjectForm(false)}
        />
      </div>
    );
  }

  // Show calendar first (higher priority when both states are set)
  if (showCalendar) {
    return (
      <WeeklyCalendar
        user={user}
        onBack={() => {
          setShowCalendar(false);
          setPreviewProject(null);
          // If we came from project details, return there
          // Otherwise stay in dashboard (selectedProject stays null)
        }}
        previewProject={previewProject}
        onShowProjectDetails={(project) => {
          // Convert CalendarProject to Project format
          const projectForDetails: Project = {
            id: project.id,
            customer: project.customer,
            artikel_nummer: project.artikel_nummer,
            artikel_bezeichnung: project.artikel_bezeichnung,
            produktgruppe: project.produktgruppe,
            gesamtmenge: project.gesamtmenge,
            beschreibung: project.beschreibung,
            erste_anlieferung: project.erste_anlieferung || undefined,
            letzte_anlieferung: project.letzte_anlieferung || undefined,
            status: project.status as Project['status'],
            created_at: project.created_at,
            created_by: project.created_by_name,
            standort_verteilung: project.standort_verteilung,
            menge_fix: project.menge_fix
          };
          // Mark that we came from calendar and save current week
          setCameFromCalendar(true);
          setSelectedProject(projectForDetails);
          setShowCalendar(false);
        }}
        onWeekChange={(newWeek) => setCalendarWeek(newWeek)}
        initialWeek={cameFromCalendar ? calendarWeek : undefined}
      />
    );
  }

  if (selectedProject) {
    return (
      <ProjectDetails
        project={selectedProject}
        user={user}
        onBack={() => {
          if (cameFromCalendar) {
            // Return to calendar with the saved week
            setCameFromCalendar(false);
            setSelectedProject(null);
            setShowCalendar(true);
          } else {
            // Return to dashboard
            setSelectedProject(null);
          }
        }}
        onProjectAction={handleProjectAction}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Mobile Optimized */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary rounded-xl flex items-center justify-center">
                <span className="text-sm sm:text-lg font-bold text-primary-foreground">PP</span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-primary">ProPlan</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Willkommen, {user.full_name || user.email} ({roleLabel[user.role]})
                </p>
                <p className="text-xs text-muted-foreground sm:hidden">
                  {roleLabel[user.role]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-3">
              <ThemeToggle />
              {user.role === "admin" && (
                <a href="/admin" className="hidden sm:inline-block">
                  <Button variant="outline" size="sm">Admin</Button>
                </a>
              )}
              <Button variant="ghost" size="sm" className="hidden sm:flex">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="hidden sm:flex">
                <User className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onSignOut} className="text-xs sm:text-sm">
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Abmelden</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-4 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          {/* Action Bar - Mobile Optimized */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-4 sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Projekte suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full sm:w-80"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Status filtern" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="approved">Genehmigt</SelectItem>
                  <SelectItem value="rejected">Abgelehnt</SelectItem>
                  <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                  <SelectItem value="completed">Abgeschlossen</SelectItem>
                  <SelectItem value="archived">Archiviert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button 
                variant="default" 
                onClick={() => setShowCalendar(true)}
                className="w-full sm:w-auto"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Wochenkalender
              </Button>
              
              {statusFilter === 'archived' ? (
                <Button 
                  variant="outline"
                  onClick={() => setStatusFilter('all')}
                  className="w-full sm:w-auto"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Zurück
                </Button>
              ) : (
                <Button 
                  variant="outline"
                  onClick={() => setStatusFilter('archived')}
                  className="w-full sm:w-auto"
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archiv
                </Button>
              )}
              
              {user.role === "vertrieb" && (
                <Button 
                  onClick={() => setShowProjectForm(true)}
                  className="w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Neues Projekt
                </Button>
              )}
            </div>
          </div>

          {/* Projects Grid - Mobile Optimized */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <Card className="col-span-full">
                <CardContent className="text-center py-12">
                  <p className="text-muted-foreground">Lade Projekte...</p>
                </CardContent>
              </Card>
            ) : filteredProjects.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="text-center py-12">
                  <p className="text-muted-foreground">Keine Projekte gefunden</p>
                </CardContent>
              </Card>
            ) : (
              filteredProjects.map((project) => (
                <Card key={project.id} className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <CardTitle className="text-base font-semibold truncate">
                            {project.customer}
                          </CardTitle>
                          <CardDescription className="text-sm truncate">
                            {project.artikel_nummer}
                          </CardDescription>
                        </div>
                      </div>
                      {(() => {
                        const displayStatus = statusFilter === "archived" && archivedPrevStatus[project.id]
                          ? (archivedPrevStatus[project.id] as Project['status'])
                          : project.status;
                        return (
                          <Badge className={`${statusColors[displayStatus]} shrink-0 ml-2`}>
                            {statusLabels[displayStatus]}
                          </Badge>
                        );
                      })()}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0 space-y-3">
                    {/* Artikel Info */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{project.artikel_bezeichnung}</span>
                    </div>
                    
                    {/* Menge */}
                    <div className="flex items-center gap-2 text-sm">
                      <Scale className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{project.gesamtmenge.toFixed(1)} kg</span>
                      {project.menge_fix && (
                        <Badge variant="outline" className="text-xs py-0">Fix</Badge>
                      )}
                    </div>

                    {/* Standort Verteilung - Kompakte Anzeige */}
                    {project.standort_verteilung && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Standorte:</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(project.standort_verteilung)
                            .filter(([_, amount]) => amount > 0)
                            .slice(0, 3)
                            .map(([location, amount]) => (
                              <Badge key={location} variant="outline" className="text-xs px-2 py-0">
                                {location}: {amount}kg
                              </Badge>
                            ))
                          }
                          {Object.entries(project.standort_verteilung).filter(([_, amount]) => amount > 0).length > 3 && (
                            <Badge variant="outline" className="text-xs px-2 py-0">
                              +{Object.entries(project.standort_verteilung).filter(([_, amount]) => amount > 0).length - 3} mehr
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="text-xs text-muted-foreground">
                        <p>{new Date(project.created_at).toLocaleDateString("de-DE")}</p>
                        <p>von {project.created_by}</p>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1">
                        {getCurrentResponsibleRole(project.status) && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {getCurrentResponsibleRole(project.status)}
                            </span>
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => setSelectedProject(project)}
                            className="h-7 px-3 text-xs"
                          >
                            Prüfen
                          </Button>
                          {user.role === "vertrieb" && (project.status === "approved" || project.status === "rejected") && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleProjectAction(project.id, "archive")}
                              className="h-7 px-3 text-xs"
                            >
                              Archivieren
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
