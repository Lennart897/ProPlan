import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, getWeek, isWithinInterval, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface Project {
  id: string;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  produktgruppe?: string;
  gesamtmenge: number;
  beschreibung?: string;
  status: "draft" | "pending" | "approved" | "rejected" | "in_progress" | "completed" | "archived";
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
  role: "vertrieb" | "supply_chain" | "planung" | "planung_storkow" | "planung_brenz" | "planung_gudensberg" | "planung_doebeln" | "planung_visbek";
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
        return parseISO(previewProject.erste_anlieferung);
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
          .eq('status', 'approved')
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
          status: project.status as Project['status'],
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

  // Filter projects based on selected filters
  const filteredProjects = projects.filter(project => {
    const locationMatch = selectedLocation === "all" || 
      (project.standort_verteilung && typeof project.standort_verteilung === 'object' && 
       project.standort_verteilung[selectedLocation] && Number(project.standort_verteilung[selectedLocation]) > 0);
    
    const productMatch = selectedProductGroup === "all" || 
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
          const startDate = parseISO(project.erste_anlieferung);
          const endDate = parseISO(project.letzte_anlieferung);
          
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
        const startDate = parseISO(previewProject.erste_anlieferung);
        const endDate = parseISO(previewProject.letzte_anlieferung);
        
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
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
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
                variant="outline" 
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
                  {totals.totalQuantity.toLocaleString('de-DE')}
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
                  {filteredProjects.length}
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

        {/* Calendar Grid - Professional Mobile Design */}
        <div className="space-y-4">
          {/* Day Headers */}
          <div className="bg-card rounded-xl border-2 shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 gap-0">
              {weekDays.map((day, index) => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div 
                    key={index} 
                    className={`h-16 sm:h-20 flex flex-col justify-center items-center border-r border-border/50 last:border-r-0 ${
                      isToday ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(day, "EE", { locale: de })}
                    </div>
                    <div className={`text-sm sm:text-base font-bold mt-1 ${
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

          {/* Project Timeline - Enhanced Mobile Experience */}
          <div className="relative min-h-[300px] bg-card rounded-xl border-2 p-3 sm:p-4">
            {/* Grid Lines */}
            <div className="absolute inset-3 sm:inset-4 grid grid-cols-7 gap-0">
              {weekDays.map((_, index) => (
                <div key={index} className="flex justify-center">
                  <div className="w-px bg-border/20 h-full" />
                </div>
              ))}
            </div>

            {/* Project Bars */}
            {projectSpans.length > 0 ? (
              <div className="relative z-10 pt-2">
                {projectSpans.map((span, spanIndex) => {
                  const { project, startDay, endDay, isPreview } = span;
                  const spanWidthPercent = ((endDay - startDay + 1) / 7) * 100;
                  const leftPositionPercent = (startDay / 7) * 100;
                  
                  return (
                    <div
                      key={`${project.id}-${spanIndex}`}
                      className="relative mb-3"
                      style={{ height: '56px' }}
                    >
                      <div
                        className={`absolute rounded-xl border-2 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl ${
                          isPreview
                            ? 'bg-gradient-to-r from-warning/20 to-warning/10 border-warning/40 border-dashed hover:from-warning/30 hover:to-warning/20'
                            : `bg-gradient-to-r from-success/20 to-success/10 border-success/40 hover:from-success/30 hover:to-success/20 hover:scale-[1.02] ${
                                hoveredProject === project.id || selectedProject === project.id
                                  ? 'ring-2 ring-primary/60 from-primary/20 to-primary/10 border-primary/60 scale-[1.02]'
                                  : ''
                              }`
                        }`}
                        style={{
                          left: `${leftPositionPercent}%`,
                          width: `${spanWidthPercent}%`,
                          height: '52px',
                          top: '2px'
                        }}
                        onMouseEnter={() => !isPreview && setHoveredProject(project.id)}
                        onMouseLeave={() => !isPreview && setHoveredProject(null)}
                        onClick={() => {
                          if (!isPreview && onShowProjectDetails) {
                            onShowProjectDetails(project);
                          }
                        }}
                        title={`${project.customer} - ${project.artikel_bezeichnung || project.produktgruppe} (${project.gesamtmenge.toLocaleString('de-DE')} kg)`}
                      >
                        <div className="p-2 sm:p-3 h-full flex items-center justify-between gap-1 min-w-0 overflow-hidden">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-xs sm:text-sm text-foreground truncate leading-tight">
                              {project.customer}
                            </div>
                            <div className="text-xs text-muted-foreground truncate leading-tight">
                              {project.gesamtmenge.toLocaleString('de-DE')} kg
                            </div>
                          </div>
                         
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {isPreview && (
                              <Badge variant="outline" className="text-xs bg-warning/20 text-warning-foreground border-warning/40">
                                VORSCHAU
                              </Badge>
                            )}
                            {project.standort_verteilung && Object.keys(project.standort_verteilung).length > 0 && (
                              <div className="text-xs text-muted-foreground truncate max-w-16">
                                {Object.entries(project.standort_verteilung)
                                  .filter(([_, qty]) => Number(qty) > 0)
                                  .map(([location]) => locationLabels[location as keyof typeof locationLabels] || location)
                                  .slice(0, 1)
                                  .join('')
                                }
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32">
                <p className="text-muted-foreground text-center">
                  Keine Projekte in dieser Woche gefunden
                </p>
              </div>
            )}
          </div>

          {/* Day Detail Cards - Mobile Optimized */}
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
            {weekDays.map((day, index) => {
              const dayProjects = filteredProjects.filter(project => {
                if (!project.erste_anlieferung || !project.letzte_anlieferung) return false;
                try {
                  const startDate = parseISO(project.erste_anlieferung);
                  const endDate = parseISO(project.letzte_anlieferung);
                  return isWithinInterval(day, { start: startDate, end: endDate });
                } catch (error) {
                  return false;
                }
              });

              const previewForDay = previewProject && previewProject.erste_anlieferung && previewProject.letzte_anlieferung ? 
                (() => {
                  try {
                    const startDate = parseISO(previewProject.erste_anlieferung);
                    const endDate = parseISO(previewProject.letzte_anlieferung);
                    return isWithinInterval(day, { start: startDate, end: endDate });
                  } catch (error) {
                    return false;
                  }
                })() : false;

              const totalQuantity = dayProjects.reduce((sum, project) => sum + project.gesamtmenge, 0) + 
                (previewForDay ? previewProject.gesamtmenge : 0);

              return (
                <Card key={index} className="rounded-xl border-2">
                  <CardContent className="p-3">
                    <div className="text-center">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Tagesproduktion
                      </div>
                      <div className="text-sm font-bold">
                        {totalQuantity.toLocaleString('de-DE')} kg
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {dayProjects.length + (previewForDay ? 1 : 0)} Projekt{dayProjects.length + (previewForDay ? 1 : 0) !== 1 ? 'e' : ''}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detailed Breakdown - Mobile Optimized */}
          <div className="grid grid-cols-1 gap-4">
            {/* By Location */}
            <Card className="rounded-xl border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mengen nach Standort</CardTitle>
                <CardDescription className="text-sm">Aufschlüsselung der Gesamtmengen</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(totals.byLocation).map(([location, quantity]) => (
                    <div key={location} className="flex justify-between items-center p-2 rounded-lg bg-secondary/20">
                      <span className="font-medium">{locationLabels[location as keyof typeof locationLabels] || location}</span>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                        {quantity.toLocaleString('de-DE')} kg
                      </Badge>
                    </div>
                  ))}
                  {Object.keys(totals.byLocation).length === 0 && (
                    <p className="text-muted-foreground text-center py-4">Keine Daten verfügbar</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* By Product */}
            <Card className="rounded-xl border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mengen nach Produktgruppe</CardTitle>
                <CardDescription className="text-sm">Aufschlüsselung der Produktgruppen</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(totals.byProduct).map(([product, quantity]) => (
                    <div key={product} className="flex justify-between items-center p-2 rounded-lg bg-secondary/20">
                      <span className="text-sm font-medium">{product}</span>
                      <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                        {quantity.toLocaleString('de-DE')} kg
                      </Badge>
                    </div>
                  ))}
                  {Object.keys(totals.byProduct).length === 0 && (
                    <p className="text-muted-foreground text-center py-4">Keine Daten verfügbar</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {loading && (
            <Card className="rounded-xl border-2">
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">Lade Projekte...</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};