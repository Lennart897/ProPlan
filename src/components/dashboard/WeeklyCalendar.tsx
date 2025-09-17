import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Calendar, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, getWeek, isWithinInterval, differenceInCalendarDays } from "date-fns";
import { de } from "date-fns/locale";
import { PROJECT_STATUS, getStatusLabel } from "@/utils/statusUtils";

type ProjectStatus = number;

interface Project {
  id: string;
  project_number: number;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  produktgruppe?: string;
  gesamtmenge: number;
  beschreibung?: string;
  status: ProjectStatus;
  archived?: boolean;
  archivedPrevStatus?: ProjectStatus;
  created_at: string;
  updated_at: string;
  created_by_id: string;
  created_by_name: string;
  standort_verteilung?: Record<string, number>;
  menge_fix: boolean;
  erste_anlieferung: string | null;
  letzte_anlieferung: string | null;
}

interface User {
  id: string;
  email: string;
  role: "vertrieb" | "supply_chain" | "planung" | "planung_storkow" | "planung_brenz" | "planung_gudensberg" | "planung_doebeln" | "planung_visbek" | "admin";
  full_name?: string;
}

interface WeeklyCalendarProps {
  user: User;
  onBack: () => void;
  previewProject?: any;
  onShowProjectDetails?: (project: Project) => void;
  onWeekChange?: (week: Date) => void;
  initialWeek?: Date;
}

const locationLabels = {
  brenz: "Brenz",
  visbek: "Visbek", 
  doebeln: "Döbeln",
  storkow: "Storkow",
  gudensberg: "Gudensberg"
};

const statusColors = {
  approved: "bg-green-100 text-green-800"
};

export const WeeklyCalendar = ({ user, onBack, previewProject, onShowProjectDetails, onWeekChange, initialWeek }: WeeklyCalendarProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(() => {
    // If we have an initial week (coming back from project details), use that
    if (initialWeek) {
      return initialWeek;
    }
    // If we have a preview project, start with the week of its first delivery
    if (previewProject?.erste_anlieferung) {
      try {
        return parseLocalDate(previewProject.erste_anlieferung);
      } catch {
        return new Date();
      }
    }
    return new Date();
  });
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [selectedProductGroup, setSelectedProductGroup] = useState<string>("all");
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const { toast } = useToast();

  // Parse a date-only string (YYYY-MM-DD) as a local Date without timezone shifts
  const parseLocalDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!y || !m || !d) return new Date(dateStr);
      return new Date(y, m - 1, d);
    } catch {
      return new Date(dateStr);
    }
  };

  // Get unique product groups from projects
  const productGroups = Array.from(new Set(projects.map(p => p.produktgruppe).filter(Boolean))).sort();

  // Load approved projects with retry logic
  useEffect(() => {
    const loadApprovedProjects = async (retryCount = 0) => {
      try {
        // Check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.warn('No active session found');
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('manufacturing_projects')
          .select('*')
          .in('status', [5, 7]) // 5 = Genehmigt, 7 = Abgeschlossen
          .order('created_at', { ascending: false });

        if (error) {
          // If it's an auth error and we haven't retried, try to refresh the session
          if (error.message.includes('JWT') && retryCount === 0) {
            console.log('Auth error detected, refreshing session...');
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError) {
              // Retry the request after session refresh
              return loadApprovedProjects(1);
            }
          }
          throw error;
        }
        
        // Transform the data to match our interface
        const transformedProjects: Project[] = (data || []).map(project => ({
          ...project,
          status: project.status as ProjectStatus,
          standort_verteilung: project.standort_verteilung as Record<string, number> || {},
          menge_fix: project.menge_fix || false
        }));
        
        setProjects(transformedProjects);
      } catch (error) {
        console.error('Error loading projects:', error);
        
        // Only show toast for non-auth errors or after retry failed
        if (retryCount > 0 || !error?.message?.includes('JWT')) {
          toast({
            title: "Fehler",
            description: "Projekte konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
            variant: "destructive"
          });
        }
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    loadApprovedProjects();
  }, [toast]);

  // Get week dates
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Filter projects based on status, selected filters, and current week
  const filteredProjects = projects.filter(project => {
    // Include both approved (5) and completed (7) projects, whether archived or not
    const statusEligible = (project.status === 5 || project.status === 7) && 
                          project.erste_anlieferung && project.letzte_anlieferung;
    if (!statusEligible) return false;

    // Check if project overlaps with current week
    try {
      const startDate = parseLocalDate(project.erste_anlieferung);
      const endDate = parseLocalDate(project.letzte_anlieferung);
      const weekEnd = addDays(weekStart, 6);
      
      // Project must overlap with the current week
      const hasWeekOverlap = startDate <= weekEnd && endDate >= weekStart;
      if (!hasWeekOverlap) return false;
    } catch (error) {
      console.error('Error parsing project dates:', error);
      return false;
    }

    const locationMatch = selectedLocation === 'all' || 
      (project.standort_verteilung && typeof project.standort_verteilung === 'object' && 
       project.standort_verteilung[selectedLocation] && Number(project.standort_verteilung[selectedLocation]) > 0);
    
    const productMatch = selectedProductGroup === 'all' || 
      project.produktgruppe === selectedProductGroup;

    return locationMatch && productMatch;
  });

  // Calculate project spans across days
  const calculateProjectSpans = () => {
    const projectSpans: Array<{
      project: Project | any;
      startDay: number;
      endDay: number;
      isPreview?: boolean;
    }> = [];

    // Process approved projects
    filteredProjects.forEach(project => {
      if (project.erste_anlieferung && project.letzte_anlieferung) {
        try {
          const startDate = parseLocalDate(project.erste_anlieferung);
          const endDate = parseLocalDate(project.letzte_anlieferung);
          
          let startDay = -1;
          let endDay = -1;
          
          weekDays.forEach((day, index) => {
            if (isSameDay(day, startDate) || (startDate < day && endDate >= day)) {
              if (startDay === -1) startDay = index;
              endDay = index;
            }
          });
          
          if (startDay !== -1 && endDay !== -1) {
            projectSpans.push({
              project,
              startDay,
              endDay,
              isPreview: false
            });
          }
        } catch (error) {
          console.error('Error parsing project dates:', error);
        }
      }
    });

    // Process preview project
    if (previewProject && previewProject.erste_anlieferung && previewProject.letzte_anlieferung) {
      try {
        const startDate = parseLocalDate(previewProject.erste_anlieferung);
        const endDate = parseLocalDate(previewProject.letzte_anlieferung);
        
        let startDay = -1;
        let endDay = -1;
        
        weekDays.forEach((day, index) => {
          if (isSameDay(day, startDate) || (startDate < day && endDate >= day)) {
            if (startDay === -1) startDay = index;
            endDay = index;
          }
        });
        
        if (startDay !== -1 && endDay !== -1) {
          projectSpans.push({
            project: previewProject,
            startDay,
            endDay,
            isPreview: true
          });
        }
      } catch (error) {
        console.error('Error parsing preview project dates:', error);
      }
    }

    return projectSpans;
  };

  const projectSpans = calculateProjectSpans();
  const weeklyProjectCount = Array.from(new Set(projectSpans.filter(s => !s.isPreview).map(s => s.project.id))).length;
  const weekEnd = addDays(weekStart, 6);
  const weeklyTotalQuantity = filteredProjects.reduce((sum, project) => {
    if (!project.erste_anlieferung || !project.letzte_anlieferung) return sum;
    try {
      const startDate = parseLocalDate(project.erste_anlieferung);
      const endDate = parseLocalDate(project.letzte_anlieferung);
      const overlapStart = startDate > weekStart ? startDate : weekStart;
      const overlapEnd = endDate < weekEnd ? endDate : weekEnd;
      if (overlapStart > overlapEnd) return sum;
      const projDays = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
      const overlapDays = Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart) + 1);
      return sum + (project.gesamtmenge * overlapDays) / projDays;
    } catch {
      return sum;
    }
  }, 0);

  // Calculate totals for current week
  const calculateTotals = () => {
    const totals = {
      totalQuantity: 0,
      byLocation: {} as Record<string, number>,
      byProduct: {} as Record<string, number>
    };

    filteredProjects.forEach(project => {
      totals.totalQuantity += project.gesamtmenge;
      
      // By product group
      if (project.produktgruppe && !totals.byProduct[project.produktgruppe]) {
        totals.byProduct[project.produktgruppe] = 0;
      }
      if (project.produktgruppe) {
        totals.byProduct[project.produktgruppe] += project.gesamtmenge;
      }

      // By location
      if (project.standort_verteilung && typeof project.standort_verteilung === 'object') {
        Object.entries(project.standort_verteilung).forEach(([location, quantity]) => {
          const qty = Number(quantity);
          if (!isNaN(qty) && qty > 0) {
            if (!totals.byLocation[location]) {
              totals.byLocation[location] = 0;
            }
            totals.byLocation[location] += qty;
          }
        });
      }
    });

    return totals;
  };

  const totals = calculateTotals();

  // Navigate weeks
  const goToPreviousWeek = () => {
    const newWeek = subWeeks(currentWeek, 1);
    setCurrentWeek(newWeek);
    onWeekChange?.(newWeek);
  };
  const goToNextWeek = () => {
    const newWeek = addWeeks(currentWeek, 1);
    setCurrentWeek(newWeek);
    onWeekChange?.(newWeek);
  };
  const goToCurrentWeek = () => {
    const newWeek = new Date();
    setCurrentWeek(newWeek);
    onWeekChange?.(newWeek);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-Optimized Header */}
      <header className="sticky top-0 z-50 border-b bg-card md:bg-card/95 md:backdrop-blur supports-[backdrop-filter]:md:bg-card/85">
        <div className="px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button 
                variant="default" 
                size="sm" 
                onClick={onBack} 
                className="h-9 w-9 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-2"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="sr-only sm:not-sr-only sm:ml-2">Zurück</span>
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md">
                  <span className="text-sm font-bold text-primary-foreground">PP</span>
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-foreground">ProPlan</h1>
                  <p className="text-xs text-muted-foreground">Wochenkalender</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="px-3 sm:px-6 pb-6 space-y-4">
        {/* Week Navigation - Mobile First */}
        <div className="bg-card rounded-xl border shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goToPreviousWeek}
                className="h-10 w-10 p-0 rounded-xl"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button 
                variant="default" 
                onClick={goToCurrentWeek} 
                className="h-10 px-4 rounded-xl text-sm font-medium"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Heute
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goToNextWeek}
                className="h-10 w-10 p-0 rounded-xl"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-lg font-bold text-foreground">
              KW {getWeek(weekStart, { locale: de })}
            </div>
            <div className="text-sm text-muted-foreground">
              {format(weekStart, "dd. MMM", { locale: de })} - {format(addDays(weekStart, 6), "dd. MMM yyyy", { locale: de })}
            </div>
          </div>
        </div>

        {/* Filters - Mobile Optimized */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="h-12 rounded-xl border-2">
              <SelectValue placeholder="Standort wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Standorte</SelectItem>
              {Object.entries(locationLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedProductGroup} onValueChange={setSelectedProductGroup}>
            <SelectTrigger className="h-12 rounded-xl border-2">
              <SelectValue placeholder="Produktgruppe wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Produktgruppen</SelectItem>
              {productGroups.map(group => (
                <SelectItem key={group} value={group}>{group}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards - Elegant Mobile Design */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="rounded-xl border-2 bg-gradient-to-br from-card to-card/80">
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-foreground">
                  {weeklyTotalQuantity.toLocaleString('de-DE', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs font-medium text-muted-foreground mt-1">
                  kg Gesamtmenge
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-2 bg-gradient-to-br from-card to-card/80">
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-foreground">
                  {weeklyProjectCount}
                </div>
                <div className="text-xs font-medium text-muted-foreground mt-1">
                  Projekte
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-2 bg-gradient-to-br from-card to-card/80 col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-foreground">
                  {Object.keys(totals.byProduct).length}
                </div>
                <div className="text-xs font-medium text-muted-foreground mt-1">
                  Produktgruppen
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Professional Weekly Planning Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Project List - Left Side */}
          <div className="xl:col-span-5 space-y-3">
            <div className="bg-card rounded-xl border shadow-sm">
              <div className="p-4 border-b bg-gradient-to-r from-primary/5 to-secondary/5">
                <h3 className="text-lg font-semibold text-foreground">Projektliste</h3>
                <p className="text-sm text-muted-foreground">
                  {filteredProjects.length} Projekte für diese Woche
                </p>
              </div>
              <div className="min-h-[200px]">
                {loading ? (
                  <div className="text-center text-muted-foreground py-8">
                    Projekte werden geladen...
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    Keine Projekte für diese Woche geplant
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {filteredProjects.map((project, index) => (
                      <div 
                        key={project.id}
                        className={`p-4 hover:bg-muted/30 cursor-pointer transition-all duration-200 ${
                          selectedProject === project.id ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                        }`}
                        onClick={() => {
                          setSelectedProject(selectedProject === project.id ? null : project.id);
                          if (onShowProjectDetails) {
                            onShowProjectDetails(project);
                          }
                        }}
                      >
                        <div className="space-y-3">
                          {/* Header: Customer & Product Group */}
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-foreground text-base">
                              {project.customer}
                            </div>
                            <Badge variant="secondary" className="text-xs font-medium">
                              {project.produktgruppe || 'N/A'}
                            </Badge>
                          </div>
                          
                          {/* Article Number & Description */}
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">
                              Art.-Nr.: <span className="font-mono text-foreground">{project.artikel_nummer}</span>
                            </div>
                            <div className="text-sm font-semibold text-foreground line-clamp-2">
                              {project.artikel_bezeichnung}
                            </div>
                          </div>
                          
                          {/* Delivery Info & Quantity */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Erste Anlieferung
                              </div>
                              <div className="text-sm font-bold text-primary">
                                {project.erste_anlieferung ? format(parseLocalDate(project.erste_anlieferung), "dd.MM.yyyy", { locale: de }) : '-'}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Letzte Anlieferung
                              </div>
                              <div className="text-sm font-bold text-secondary-foreground">
                                {project.letzte_anlieferung ? format(parseLocalDate(project.letzte_anlieferung), "dd.MM.yyyy", { locale: de }) : '-'}
                              </div>
                            </div>
                          </div>
                          
                          {/* Quantity */}
                          <div className="bg-accent/30 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-muted-foreground">Gesamtmenge</span>
                              <span className="text-lg font-bold text-foreground">
                                {project.gesamtmenge?.toLocaleString('de-DE')} kg
                              </span>
                            </div>
                          </div>

                          {/* Location Distribution */}
                          {project.standort_verteilung && Object.keys(project.standort_verteilung).length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Standortverteilung
                              </div>
                              <div className="grid grid-cols-1 gap-1">
                                {Object.entries(project.standort_verteilung).map(([location, quantity]) => {
                                  const qty = Number(quantity);
                                  if (qty <= 0) return null;
                                  return (
                                    <div key={location} className="flex justify-between items-center text-xs bg-secondary/20 rounded px-2 py-1">
                                      <span className="font-medium">
                                        {locationLabels[location as keyof typeof locationLabels] || location}
                                      </span>
                                      <span className="font-bold">
                                        {qty.toLocaleString('de-DE')} kg
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {/* Preview Project */}
                    {previewProject && (
                      <div className="p-4 bg-orange-50 border-l-4 border-l-orange-400">
                        <div className="flex items-center gap-2 mb-3">
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700 font-semibold">
                            Vorschau
                          </Badge>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-foreground text-base">
                              {previewProject.customer}
                            </div>
                            <Badge variant="secondary" className="text-xs font-medium">
                              {previewProject.produktgruppe || 'N/A'}
                            </Badge>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">
                              Art.-Nr.: <span className="font-mono text-foreground">{previewProject.artikel_nummer}</span>
                            </div>
                            <div className="text-sm font-semibold text-foreground">
                              {previewProject.artikel_bezeichnung}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Erste Anlieferung
                              </div>
                              <div className="text-sm font-bold text-primary">
                                {previewProject.erste_anlieferung ? format(parseLocalDate(previewProject.erste_anlieferung), "dd.MM.yyyy", { locale: de }) : '-'}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Letzte Anlieferung
                              </div>
                              <div className="text-sm font-bold text-secondary-foreground">
                                {previewProject.letzte_anlieferung ? format(parseLocalDate(previewProject.letzte_anlieferung), "dd.MM.yyyy", { locale: de }) : '-'}
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-orange-100 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-orange-700">Gesamtmenge</span>
                              <span className="text-lg font-bold text-orange-900">
                                {previewProject.gesamtmenge?.toLocaleString('de-DE')} kg
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Calendar Timeline - Right Side */}
          <div className="xl:col-span-7 space-y-4">
            {/* Day Headers */}
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 gap-0">
                {weekDays.map((day, index) => {
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div 
                      key={index} 
                      className={`h-16 sm:h-20 flex flex-col justify-center items-center border-r border-border/50 last:border-r-0 ${
                        isToday ? 'bg-primary/10' : ''
                      }`}
                    >
                      <div className={`text-xs font-medium uppercase tracking-wide ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                        {format(day, "EE", { locale: de })}
                      </div>
                      <div className={`text-lg font-bold mt-1 ${
                        isToday ? 'text-primary' : 'text-foreground'
                      }`}>
                        {format(day, "dd")}
                      </div>
                      <div className={`text-xs ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                        {format(day, "MMM", { locale: de })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Project Timeline */}
            <div className="relative min-h-[400px] bg-card rounded-xl border p-4">
              {/* Grid Lines */}
              <div className="absolute inset-4 grid grid-cols-7 gap-0 pointer-events-none">
                {weekDays.map((_, index) => (
                  <div key={index} className="flex justify-center">
                    <div className="w-px bg-border/30 h-full" />
                  </div>
                ))}
              </div>

              {/* Project Bars */}
              {projectSpans.length > 0 ? (
                <div className="relative z-10 pt-2 space-y-2">
                  {projectSpans.map((span, spanIndex) => {
                    const { project, startDay, endDay, isPreview } = span;
                    const spanWidthPercent = ((endDay - startDay + 1) / 7) * 100;
                    const leftPositionPercent = (startDay / 7) * 100;
                    
                    return (
                      <div
                        key={`${project.id}-${spanIndex}`}
                        className="relative h-16"
                      >
                        <div
                          className={`absolute rounded-lg border-2 transition-all duration-300 cursor-pointer shadow-md hover:shadow-lg ${
                            isPreview
                              ? 'bg-gradient-to-r from-orange-100 to-orange-50 border-orange-300 border-dashed hover:from-orange-200 hover:to-orange-100'
                              : selectedProject === project.id
                                ? 'bg-gradient-to-r from-primary/20 to-primary/10 border-primary ring-2 ring-primary/30 scale-[1.02]'
                                : 'bg-gradient-to-r from-blue-100 to-blue-50 border-blue-300 hover:from-blue-200 hover:to-blue-100 hover:scale-[1.01]'
                          }`}
                          style={{
                            left: `${leftPositionPercent}%`,
                            width: `${spanWidthPercent}%`,
                            height: '56px',
                            top: '4px'
                          }}
                          onMouseEnter={() => !isPreview && setHoveredProject(project.id)}
                          onMouseLeave={() => !isPreview && setHoveredProject(null)}
                          onClick={() => {
                            setSelectedProject(project.id);
                            if (!isPreview && onShowProjectDetails) {
                              onShowProjectDetails(project);
                            }
                          }}
                        >
                          <div className="p-3 h-full flex items-center justify-between gap-2 min-w-0">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm text-foreground truncate">
                                {project.customer}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {project.artikel_nummer}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isPreview && (
                                <Badge variant="outline" className="text-xs bg-orange-200 text-orange-800 border-orange-400">
                                  Vorschau
                                </Badge>
                              )}
                              <div className="text-xs font-bold text-foreground">
                                {project.gesamtmenge?.toLocaleString('de-DE')} kg
                              </div>
                            </div>
                          </div>

                          {/* Enhanced Tooltip */}
                          {hoveredProject === project.id && (
                            <div className="absolute z-50 -top-2 left-1/2 transform -translate-x-1/2 -translate-y-full">
                              <div className="bg-popover text-popover-foreground p-4 rounded-lg shadow-xl border max-w-sm">
                                <div className="font-bold text-base">{project.customer}</div>
                                <div className="text-sm text-muted-foreground font-mono">
                                  {project.artikel_nummer}
                                </div>
                                <div className="text-sm font-medium mt-1">
                                  {project.artikel_bezeichnung}
                                </div>
                                <div className="text-sm mt-2 space-y-1">
                                  <div>Menge: <span className="font-bold">{project.gesamtmenge?.toLocaleString('de-DE')} kg</span></div>
                                  <div>Von: <span className="font-bold">{project.erste_anlieferung}</span></div>
                                  <div>Bis: <span className="font-bold">{project.letzte_anlieferung}</span></div>
                                </div>
                                {project.produktgruppe && (
                                  <div className="text-xs text-muted-foreground mt-2">
                                    {project.produktgruppe}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-16">
                  Keine Projekte für diese Woche geplant
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary breakdown cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Location */}
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Standort-Übersicht</CardTitle>
              <CardDescription>Mengenverteilung nach Standorten</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(totals.byLocation).map(([location, quantity]) => (
                <div key={location} className="flex justify-between items-center">
                  <span className="font-medium">{locationLabels[location as keyof typeof locationLabels] || location}</span>
                  <Badge variant="secondary" className="font-bold">
                    {quantity.toLocaleString('de-DE')} kg
                  </Badge>
                </div>
              ))}
              {Object.keys(totals.byLocation).length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  Keine Daten verfügbar
                </div>
              )}
            </CardContent>
          </Card>

          {/* By Product Group */}
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Produktgruppen-Übersicht</CardTitle>
              <CardDescription>Mengenverteilung nach Produktgruppen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(totals.byProduct).map(([product, quantity]) => (
                <div key={product} className="flex justify-between items-center">
                  <span className="font-medium">{product}</span>
                  <Badge variant="secondary" className="font-bold">
                    {quantity.toLocaleString('de-DE')} kg
                  </Badge>
                </div>
              ))}
              {Object.keys(totals.byProduct).length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  Keine Daten verfügbar
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};