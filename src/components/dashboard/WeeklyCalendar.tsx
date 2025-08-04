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
  status: string;
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
  role: "vertrieb" | "supply_chain" | "planung";
  full_name?: string;
}

interface WeeklyCalendarProps {
  user: User;
  onBack: () => void;
  previewProject?: any;
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

export const WeeklyCalendar = ({ user, onBack, previewProject }: WeeklyCalendarProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(() => {
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
  const goToPreviousWeek = () => setCurrentWeek(subWeeks(currentWeek, 1));
  const goToNextWeek = () => setCurrentWeek(addWeeks(currentWeek, 1));
  const goToCurrentWeek = () => setCurrentWeek(new Date());

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-sm font-bold text-primary-foreground">PP</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-primary">ProPlan</h1>
                  <p className="text-muted-foreground">Wochenkalender - Genehmigte Projekte</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-6">
        <div className="space-y-6">
          {/* Controls */}
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* Week Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={goToCurrentWeek}>
                <Calendar className="h-4 w-4 mr-2" />
                Heute
              </Button>
              <Button variant="outline" size="sm" onClick={goToNextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="font-medium ml-4">
                KW {getWeek(weekStart, { locale: de })} | {format(weekStart, "dd.MM.yyyy", { locale: de })} - {format(addDays(weekStart, 6), "dd.MM.yyyy", { locale: de })}
              </span>
            </div>

            {/* Filters */}
            <div className="flex gap-4">
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-48">
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
                <SelectTrigger className="w-48">
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
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Gesamtmenge</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totals.totalQuantity.toLocaleString('de-DE')} kg</div>
                <p className="text-xs text-muted-foreground">Kilogramm</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Anzahl Projekte</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{filteredProjects.length}</div>
                <p className="text-xs text-muted-foreground">Genehmigt</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Produktgruppen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Object.keys(totals.byProduct).length}</div>
                <p className="text-xs text-muted-foreground">Verschiedene</p>
              </CardContent>
            </Card>
          </div>

          {/* Calendar Grid with Connected Projects */}
          <div className="relative">
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-2 mb-4">
              {weekDays.map((day, index) => (
                <Card key={index} className="h-20 border-2">
                  <CardContent className="p-3 text-center h-full flex flex-col justify-center">
                    <div className="text-sm font-medium text-muted-foreground">
                      {format(day, "EEE", { locale: de })}
                    </div>
                    <div className="text-lg font-bold">
                      {format(day, "dd.MM", { locale: de })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Project Timeline with Connected Spans */}
            <div className="relative" style={{ minHeight: `${Math.max(projectSpans.length * 70 + 40, 200)}px` }}>
              {/* Vertical Day Lines for Connection */}
              <div className="absolute inset-0 grid grid-cols-7 gap-2 pointer-events-none">
                {weekDays.map((_, index) => (
                  <div key={index} className="relative">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border/30 transform -translate-x-1/2" />
                  </div>
                ))}
              </div>

              {/* Horizontal Project Spans */}
              <div className="relative z-10 space-y-2 pt-4">
                {projectSpans.map((span, spanIndex) => {
                  const { project, startDay, endDay, isPreview } = span;
                  const spanWidth = ((endDay - startDay + 1) * 100) / 7;
                  const leftPosition = (startDay * 100) / 7;
                  const gapAdjustment = (startDay * 8) / 7; // Account for gaps between columns
                  
                  return (
                    <div
                      key={`${project.id}-${spanIndex}`}
                      className="relative"
                      style={{ 
                        height: '60px',
                        marginBottom: '10px'
                      }}
                    >
                      <div
                        className={`absolute h-14 rounded-lg border-2 transition-all duration-200 cursor-pointer shadow-sm ${
                          isPreview
                            ? 'bg-orange-100 border-orange-300 border-dashed hover:bg-orange-200 hover:shadow-md'
                            : `bg-success/10 border-success/30 hover:bg-success/20 hover:shadow-md hover:border-success/50 ${
                                hoveredProject === project.id || selectedProject === project.id
                                  ? 'ring-2 ring-primary/50 bg-success/20 border-primary/50 shadow-md'
                                  : ''
                              }`
                        }`}
                        style={{
                          left: `calc(${leftPosition}% + ${gapAdjustment}px)`,
                          width: `calc(${spanWidth}% - ${((endDay - startDay + 1) * 8) / 7}px)`,
                          top: '0px'
                        }}
                        onMouseEnter={() => !isPreview && setHoveredProject(project.id)}
                        onMouseLeave={() => !isPreview && setHoveredProject(null)}
                        onClick={() => !isPreview && setSelectedProject(selectedProject === project.id ? null : project.id)}
                        title={`${project.customer} - ${project.artikel_bezeichnung || project.produktgruppe} (${project.gesamtmenge.toLocaleString('de-DE')} kg)`}
                      >
                        <div className="p-3 h-full flex flex-col justify-between">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-foreground truncate">
                                {project.customer}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {project.produktgruppe || project.artikel_bezeichnung}
                              </div>
                            </div>
                            {isPreview && (
                              <Badge variant="outline" className="text-xs bg-orange-200 text-orange-800 border-orange-400 flex-shrink-0">
                                VORSCHAU
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-end justify-between gap-2">
                            <div className="text-sm font-bold text-foreground">
                              {project.gesamtmenge.toLocaleString('de-DE')} kg
                            </div>
                            {project.standort_verteilung && Object.keys(project.standort_verteilung).length > 0 && (
                              <div className="text-xs text-muted-foreground truncate flex-shrink-0 max-w-[40%]">
                                {Object.entries(project.standort_verteilung)
                                  .filter(([_, qty]) => Number(qty) > 0)
                                  .map(([location]) => locationLabels[location as keyof typeof locationLabels] || location)
                                  .slice(0, 2)
                                  .join(', ')
                                }
                                {Object.entries(project.standort_verteilung).filter(([_, qty]) => Number(qty) > 0).length > 2 && '...'}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Connection Lines to Days */}
                        <div className="absolute -top-1 -bottom-1 left-0 w-1 bg-current opacity-20 rounded-full" />
                        <div className="absolute -top-1 -bottom-1 right-0 w-1 bg-current opacity-20 rounded-full" />
                      </div>
                    </div>
                  );
                })}
                
                {projectSpans.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">Keine Projekte in dieser Woche</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Day Detail Cards */}
            <div className="grid grid-cols-7 gap-4 mt-6">
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
                  <Card key={index} className="min-h-[100px]">
                    <CardContent className="p-3">
                      <div className="text-center">
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          Tagesproduktion
                        </div>
                        <div className="text-lg font-bold">
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
          </div>

          {/* Detailed Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Location */}
            <Card>
              <CardHeader>
                <CardTitle>Mengen nach Standort</CardTitle>
                <CardDescription>Aufschlüsselung der Gesamtmengen</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(totals.byLocation).map(([location, quantity]) => (
                    <div key={location} className="flex justify-between items-center">
                      <span>{locationLabels[location as keyof typeof locationLabels] || location}</span>
                      <Badge variant="outline">{quantity.toLocaleString('de-DE')} kg</Badge>
                    </div>
                  ))}
                  {Object.keys(totals.byLocation).length === 0 && (
                    <p className="text-muted-foreground">Keine Daten verfügbar</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* By Product */}
            <Card>
              <CardHeader>
                <CardTitle>Mengen nach Produktgruppe</CardTitle>
                <CardDescription>Aufschlüsselung der Produktgruppen</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(totals.byProduct).map(([product, quantity]) => (
                    <div key={product} className="flex justify-between items-center">
                      <span className="text-sm">{product}</span>
                      <Badge variant="outline">{quantity.toLocaleString('de-DE')} kg</Badge>
                    </div>
                  ))}
                  {Object.keys(totals.byProduct).length === 0 && (
                    <p className="text-muted-foreground">Keine Daten verfügbar</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {loading && (
            <Card>
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