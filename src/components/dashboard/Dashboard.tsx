import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Filter, Search, Bell, User, LogOut, Calendar, Archive, ArrowLeft, Building2, Package, Scale, LayoutGrid, List, History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectForm } from "./ProjectForm";
import { ProjectDetails } from "./ProjectDetails";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ActivityLog } from "./ActivityLog";
import { getStatusLabel, getStatusColor, canArchiveProject, PROJECT_STATUS } from "@/utils/statusUtils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme/theme-toggle";

// Import the Project type from WeeklyCalendar to avoid type conflicts
type CalendarProject = {
  id: string;
  project_number?: number;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  produktgruppe?: string;
  gesamtmenge: number;
  beschreibung?: string;
  erste_anlieferung?: string;
  letzte_anlieferung?: string;
  status: number;
  created_at: string;
  updated_at: string;
  created_by_id: string;
  created_by_name: string;
  standort_verteilung?: Record<string, number>;
  menge_fix: boolean;
};

interface Project {
  id: string;
  project_number: number;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  produktgruppe?: string;
  gesamtmenge: number;
  beschreibung?: string;
  erste_anlieferung?: string;
  letzte_anlieferung?: string;
  status: number;
  status_label?: string;
  status_color?: string;
  created_at: string;
  created_by: string;
  created_by_id?: string;
  created_by_name?: string;
  standort_verteilung?: Record<string, number>;
  menge_fix?: boolean;
  archived?: boolean;
  archived_at?: string;
}

interface User {
  id: string;
  email: string;
  role: "vertrieb" | "supply_chain" | "planung" | "planung_storkow" | "planung_brenz" | "planung_gudensberg" | "planung_doebeln" | "planung_visbek" | "admin";
  full_name?: string;
}

interface DashboardProps {
  user: User;
  onSignOut: () => void;
}

export const Dashboard = ({ user, onSignOut }: DashboardProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [previewProject, setPreviewProject] = useState<CalendarProject | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [cameFromCalendar, setCameFromCalendar] = useState(false);
  const [calendarWeek, setCalendarWeek] = useState<Date>(new Date());
  const [archivedPrevStatus, setArchivedPrevStatus] = useState<Record<string, number>>({});
  const [archiveStatusFilter, setArchiveStatusFilter] = useState<'all' | '5' | '6'>("all");
  const [activeTab, setActiveTab] = useState<'projects' | 'archive'>('projects');
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('list');
  const [showActivity, setShowActivity] = useState(false);
  const [previewInitialWeek, setPreviewInitialWeek] = useState<Date | null>(null);
  const { toast } = useToast();

  // Load saved view preference per user
  useEffect(() => {
    const key = `dashboardView_${user.id}`;
    const saved = localStorage.getItem(key);
    if (saved === "matrix" || saved === "list") {
      setViewMode(saved as "matrix" | "list");
    }
  }, [user.id]);

  // Persist view preference per user
  useEffect(() => {
    const key = `dashboardView_${user.id}`;
    localStorage.setItem(key, viewMode);
  }, [viewMode, user.id]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('manufacturing_projects_with_status_label')
        .select('*')
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setProjects(data || []);
    } catch (error) {
      console.error('Fehler beim Laden der Projekte:', error);
      toast({
        title: "Fehler",
        description: "Projekte konnten nicht geladen werden.",
        variant: "destructive",
      });
    }
  };

  const fetchArchivedProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('manufacturing_projects_with_status_label')
        .select('*')
        .eq('archived', true)
        .order('archived_at', { ascending: false });

      if (error) throw error;

      setArchivedProjects(data || []);
    } catch (error) {
      console.error('Fehler beim Laden der archivierten Projekte:', error);
      toast({
        title: "Fehler",
        description: "Archivierte Projekte konnten nicht geladen werden.",
        variant: "destructive",
      });
    }
  };

  const handleProjectAction = async (project: any, action: string, reason?: string) => {
    try {
      let updateData: any = {};
      
      switch (action) {
        case 'approve':
          updateData = { status: PROJECT_STATUS.GENEHMIGT };
          break;
        case 'reject':
          updateData = { status: PROJECT_STATUS.ABGELEHNT, rejection_reason: reason };
          break;
        case 'archive':
          if (!canArchiveProject(project.status)) {
            throw new Error('Projekt kann nur archiviert werden wenn es genehmigt, abgelehnt oder abgeschlossen ist.');
          }
          updateData = { archived: true, archived_at: new Date().toISOString() };
          break;
        case 'send_to_progress':
          updateData = { status: PROJECT_STATUS.PRUEFUNG_PLANUNG };
          break;
        case 'send_to_vertrieb':
          updateData = { status: PROJECT_STATUS.PRUEFUNG_VERTRIEB };
          break;
        case 'correct':
          // Korrekturdaten werden separat verarbeitet
          updateData = reason; // reason enthält hier die Korrekturdaten
          break;
        case 'cancel':
          updateData = { status: PROJECT_STATUS.ABGELEHNT, rejection_reason: 'Projekt vom Ersteller abgesagt' };
          break;
        default:
          throw new Error(`Unbekannte Aktion: ${action}`);
      }

      const { error } = await supabase
        .from('manufacturing_projects')
        .update(updateData)
        .eq('id', project.id);

      if (error) throw error;

      // Status-spezifische Nachrichten
      const messages = {
        approve: "Projekt wurde genehmigt.",
        reject: "Projekt wurde abgelehnt.",
        archive: "Projekt wurde archiviert.",
        send_to_progress: "Projekt wurde zur Bearbeitung weitergeleitet.",
        send_to_vertrieb: "Projekt wurde an Vertrieb weitergeleitet.",
        correct: "Projekt wurde korrigiert.",
        cancel: "Projekt wurde abgesagt."
      };

      toast({
        title: "Erfolg",
        description: messages[action as keyof typeof messages],
      });

      // Projekte neu laden
      fetchProjects();
      if (activeTab === 'archive') {
        fetchArchivedProjects();
      }
    } catch (error) {
      console.error(`Fehler bei ${action}:`, error);
      toast({
        title: "Fehler",
        description: `Aktion konnte nicht ausgeführt werden: ${error}`,
        variant: "destructive",
      });
    }
  };

  const isArchiveView = statusFilter === "archived";
  const displayProjects = isArchiveView ? archivedProjects : projects;

  // Load archived projects when archive tab is activated
  useEffect(() => {
    if (isArchiveView && archivedProjects.length === 0) {
      fetchArchivedProjects();
    }
  }, [isArchiveView]);

  const filteredProjects = displayProjects.filter(project => {
    const matchesSearch = project.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.artikel_nummer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.artikel_bezeichnung.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = isArchiveView
      ? true
      : (statusFilter === "all" || project.status.toString() === statusFilter);
    
    // Im Archiv zusätzlich nach vorherigem Status filtern (approved/rejected)
    const matchesArchivePrev = !isArchiveView 
      || archiveStatusFilter === 'all' 
      || (archivedPrevStatus[project.id] && archivedPrevStatus[project.id].toString() === archiveStatusFilter);
    
    // Standortbasierte Filterung für Planning-Rollen
    const matchesLocationFilter = () => {
      // Nur für Projekte im Status "Prüfung Planung" relevant
      if (project.status !== PROJECT_STATUS.PRUEFUNG_PLANUNG) {
        return true;
      }

      // Standortspezifische Planungsrollen
      if (user.role.startsWith('planung_')) {
        const userLocationCode = user.role.replace('planung_', '');
        
        // Prüfe ob das Projekt eine standort_verteilung hat
        if (!project.standort_verteilung) {
          return false;
        }
        
        // Mapping von Location-Codes zu möglichen Namen in standort_verteilung
        const locationNameMapping: Record<string, string[]> = {
          'brenz': ['Brenz', 'brenz'],
          'doebeln': ['Döbeln', 'doebeln', 'Doebeln'],
          'gudensberg': ['Gudensberg', 'gudensberg'],
          'storkow': ['Storkow', 'storkow'],
          'visbek': ['Visbek', 'visbek']
        };
        
        const possibleNames = locationNameMapping[userLocationCode] || [userLocationCode];
        
        // Suche nach der Menge für diesen Standort
        let locationQuantity = 0;
        for (const possibleName of possibleNames) {
          if (project.standort_verteilung[possibleName]) {
            locationQuantity = project.standort_verteilung[possibleName];
            break;
          }
        }
        
        return locationQuantity > 0;
      }
      
      // Globale planung und admin Rollen sehen alle Projekte
      if (user.role === 'planung' || user.role === 'admin') {
        return true;
      }
      
      return true;
    };
    
    // Rollenbasierte Filterung 
    const matchesRole = () => {
      switch (user.role) {
        case "supply_chain":
          return isArchiveView || project.status === PROJECT_STATUS.PRUEFUNG_SUPPLY_CHAIN;
        case "planung":
        case "planung_storkow":
        case "planung_brenz":
        case "planung_gudensberg":
        case "planung_doebeln":
        case "planung_visbek":
          return isArchiveView || project.status === PROJECT_STATUS.PRUEFUNG_PLANUNG;
        case "vertrieb":
          return true; // Vertrieb sieht alle Projekte
        default:
          return true;
      }
    };
    
    return matchesSearch && matchesStatus && matchesArchivePrev && matchesRole() && matchesLocationFilter();
  });

  const getCurrentResponsibleRole = (status: number) => {
    switch (status) {
      case PROJECT_STATUS.ERFASSUNG:
        return "Vertrieb";
      case PROJECT_STATUS.PRUEFUNG_VERTRIEB:
        return "Vertrieb";
      case PROJECT_STATUS.PRUEFUNG_SUPPLY_CHAIN:
        return "Supply Chain";
      case PROJECT_STATUS.PRUEFUNG_PLANUNG:
        return "Planung (standortspezifisch)";
      case PROJECT_STATUS.GENEHMIGT:
        return null; // Keine Anzeige bei genehmigten Projekten
      case PROJECT_STATUS.ABGELEHNT:
        return null; // Keine Anzeige bei abgelehnten Projekten  
      case PROJECT_STATUS.ABGESCHLOSSEN:
        return null; // Keine Anzeige bei abgeschlossenen Projekten
      default:
        return "Unbekannt";
    }
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
            fetchProjects();
          }}
          onCancel={() => setShowProjectForm(false)}
        />
      </div>
    );
  }

  if (showCalendar) {
    return (
      <WeeklyCalendar
        user={user}
        onBack={() => {
          setShowCalendar(false);
          setPreviewProject(null);
          setPreviewInitialWeek(null);
        }}
        previewProject={previewProject}
        onShowProjectDetails={(project) => {
          const found = projects.find(p => p.id === project.id);
          const projectForDetails: Project = {
            id: project.id,
            project_number: (project as any).project_number ?? found?.project_number ?? 0,
            customer: project.customer,
            artikel_nummer: project.artikel_nummer,
            artikel_bezeichnung: project.artikel_bezeichnung,
            produktgruppe: project.produktgruppe,
            gesamtmenge: project.gesamtmenge,
            beschreibung: project.beschreibung,
            erste_anlieferung: project.erste_anlieferung || undefined,
            letzte_anlieferung: project.letzte_anlieferung || undefined,
            status: Number(project.status),
            created_at: project.created_at,
            created_by: project.created_by_name || "",
            created_by_id: project.created_by_id,
            created_by_name: project.created_by_name,
            standort_verteilung: project.standort_verteilung,
            menge_fix: project.menge_fix
          };
          setCameFromCalendar(true);
          setSelectedProject(projectForDetails);
          setShowCalendar(false);
        }}
        onWeekChange={(newWeek) => setCalendarWeek(newWeek)}
        initialWeek={cameFromCalendar ? calendarWeek : (previewInitialWeek ?? undefined)}
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
            setCameFromCalendar(false);
            setSelectedProject(null);
            setShowCalendar(true);
          } else {
            setSelectedProject(null);
          }
        }}
        onProjectAction={handleProjectAction}
        onShowPreview={(previewProj) => {
          setPreviewProject(previewProj);
          if (previewProj.erste_anlieferung) {
            setPreviewInitialWeek(new Date(previewProj.erste_anlieferung));
          }
          setShowCalendar(true);
        }}
      />
    );
  }


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
                <a href="/admin">
                  <Button variant="outline" size="sm">
                    <span className="hidden sm:inline">Admin</span>
                    <span className="sm:hidden">A</span>
                  </Button>
                </a>
              )}
              <Button variant="ghost" size="sm" className="hidden sm:flex">
                <Bell className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="hidden sm:flex"
                onClick={() => window.location.href = '/password-settings'}
                title="Passwort-Einstellungen"
              >
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
          {/* Action Bar */}
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
              {statusFilter === 'archived' ? (
                <Select value={archiveStatusFilter} onValueChange={(v) => setArchiveStatusFilter(v as 'all' | '5' | '6')}>
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue placeholder="Archiv-Status filtern" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle im Archiv</SelectItem>
                    <SelectItem value="5">Genehmigt (archiviert)</SelectItem>
                    <SelectItem value="6">Abgelehnt (archiviert)</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Status filtern" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Status</SelectItem>
                    <SelectItem value="2">Prüfung Vertrieb</SelectItem>
                    <SelectItem value="3">Prüfung SupplyChain</SelectItem>
                    <SelectItem value="4">Prüfung Planung</SelectItem>
                    <SelectItem value="5">Genehmigt</SelectItem>
                    <SelectItem value="6">Abgelehnt</SelectItem>
                    <SelectItem value="7">Abgeschlossen</SelectItem>
                    <SelectItem value="archived">Archiviert</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            
            <div className="flex flex-col gap-2 sm:flex-row">
              {/* Ansicht umschalten: Matrix | Liste */}
              <div className="flex w-full sm:w-auto">
                <Button
                  variant={viewMode === 'matrix' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('matrix')}
                  className="w-1/2 sm:w-auto rounded-r-none"
                >
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Matrix
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="w-1/2 sm:w-auto rounded-l-none -ml-px"
                >
                  <List className="h-4 w-4 mr-2" />
                  Liste
                </Button>
              </div>

              {statusFilter !== 'archived' && (
                <Button 
                  variant="default" 
                  onClick={() => setShowCalendar(true)}
                  className="w-full sm:w-auto"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Wochenkalender
                </Button>
              )}
              
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
              
              {user.role === "vertrieb" && statusFilter !== 'archived' && (
                <Button 
                  onClick={() => setShowProjectForm(true)}
                  className="w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Neues Projekt
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShowActivity(true)}
                className="w-full sm:w-auto"
              >
                <History className="h-4 w-4 mr-2" />
                Aktivitäten
              </Button>
            </div>
          </div>

          {/* Projects Display */}
          {filteredProjects.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">Keine Projekte gefunden</p>
              </CardContent>
            </Card>
          ) : viewMode === 'matrix' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((project) => (
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
                          <div className="text-sm font-medium text-primary">
                            Projekt-Nr.: {project.project_number}
                          </div>
                        </div>
                      </div>
                      <Badge className={project.status_color || getStatusColor(project.status)}>
                        {project.status_label || getStatusLabel(project.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0 space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{project.artikel_bezeichnung}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm">
                      <Scale className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{project.gesamtmenge.toLocaleString('de-DE')} kg</span>
                      {project.menge_fix && (
                        <Badge variant="outline" className="text-xs py-0">Fix</Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="text-xs text-muted-foreground">
                        <p>{new Date(project.created_at).toLocaleDateString("de-DE")}</p>
                        <p>von {project.created_by_name || project.created_by || 'Unbekannt'}</p>
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
                          {user.role === "vertrieb" && canArchiveProject(project.status) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleProjectAction(project, "archive")}
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
              ))}
            </div>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle>Projekte</CardTitle>
                <CardDescription>Tabellarische Übersicht</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="relative w-full overflow-auto">
                  <Table className="min-w-[720px]">
                    <TableHeader>
                      <TableRow>
                         <TableHead>Projekt-Nr.</TableHead>
                         <TableHead>Kunde</TableHead>
                         <TableHead>Artikel</TableHead>
                         <TableHead>Artikel-Nr.</TableHead>
                         <TableHead>Menge</TableHead>
                          {statusFilter !== 'archived' && (
                            <>
                              <TableHead>Erste Anlieferung</TableHead>
                              <TableHead>Letzte Anlieferung</TableHead>
                            </>
                          )}
                          <TableHead>Erstellt von</TableHead>
                          <TableHead>Status</TableHead>
                         <TableHead className="text-right">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProjects.map((project) => (
                        <TableRow key={project.id}>
                           <TableCell className="whitespace-nowrap">{project.project_number}</TableCell>
                           <TableCell className="font-medium">{project.customer}</TableCell>
                           <TableCell className="truncate max-w-[280px]">{project.artikel_bezeichnung}</TableCell>
                           <TableCell className="whitespace-nowrap">{project.artikel_nummer}</TableCell>
                           <TableCell className="whitespace-nowrap">
                             {project.gesamtmenge.toLocaleString('de-DE')} kg
                           </TableCell>
                            {statusFilter !== 'archived' && (
                              <>
                                <TableCell>
                                  {project.erste_anlieferung 
                                    ? new Date(project.erste_anlieferung).toLocaleDateString("de-DE")
                                    : "-"
                                  }
                                </TableCell>
                                <TableCell>
                                  {project.letzte_anlieferung 
                                    ? new Date(project.letzte_anlieferung).toLocaleDateString("de-DE")
                                    : "-"
                                  }
                                </TableCell>
                              </>
                            )}
                            <TableCell className="whitespace-nowrap">
                              {project.created_by_name || "-"}
                            </TableCell>
                            <TableCell>
                             <Badge className={project.status_color || getStatusColor(project.status)}>
                               {project.status_label || getStatusLabel(project.status)}
                             </Badge>
                           </TableCell>
                           <TableCell className="text-right">
                             <div className="flex justify-end gap-2">
                               <Button 
                                 size="sm" 
                                 onClick={() => setSelectedProject(project)}
                                 className="h-7 px-3 text-xs"
                              >
                                Prüfen
                              </Button>
                              {user.role === "vertrieb" && canArchiveProject(project.status) && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleProjectAction(project, "archive")}
                                  className="h-7 px-3 text-xs"
                                >
                                  Archivieren
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Aktivitäten-Dialog */}
          <Dialog open={showActivity} onOpenChange={setShowActivity}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Aktivitäten</DialogTitle>
                <DialogDescription>Ihr persönliches Aktivitätenprotokoll</DialogDescription>
              </DialogHeader>
              <ActivityLog userId={user.id} userRole={user.role} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};