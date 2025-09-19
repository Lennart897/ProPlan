import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Calendar, ArrowLeft, ChevronDown, ChevronRight as ChevronRightIcon, Minus, Plus } from "lucide-react";
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
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
  }).sort((a, b) => {
    // Sort by product group first, then by customer name
    const productGroupA = a.produktgruppe || 'ZZZ'; // Put items without product group at the end
    const productGroupB = b.produktgruppe || 'ZZZ';
    
    if (productGroupA !== productGroupB) {
      return productGroupA.localeCompare(productGroupB);
    }
    
    return a.customer.localeCompare(b.customer);
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

  // Calculate daily sums by product group
  const calculateDailySums = () => {
    const dailySums: Record<string, Record<string, number>> = {}; // date -> productGroup -> quantity
    const productGroups = new Set<string>();

    filteredProjects.forEach(project => {
      if (!project.erste_anlieferung || !project.letzte_anlieferung || !project.produktgruppe) return;
      
      try {
        const startDate = parseLocalDate(project.erste_anlieferung);
        const endDate = parseLocalDate(project.letzte_anlieferung);
        const projDays = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
        const dailyQuantity = project.gesamtmenge / projDays;
        
        productGroups.add(project.produktgruppe);
        
        weekDays.forEach(day => {
          if (day >= startDate && day <= endDate) {
            const dateKey = format(day, 'yyyy-MM-dd');
            if (!dailySums[dateKey]) dailySums[dateKey] = {};
            if (!dailySums[dateKey][project.produktgruppe]) dailySums[dateKey][project.produktgruppe] = 0;
            dailySums[dateKey][project.produktgruppe] += dailyQuantity;
          }
        });
      } catch (error) {
        console.error('Error calculating daily sums:', error);
      }
    });

    return { dailySums, productGroups: Array.from(productGroups).sort() };
  };

  const { dailySums, productGroups: activeProductGroups } = calculateDailySums();

  // Toggle product group expansion
  const toggleGroup = (groupName: string) => {
    const newExpandedGroups = new Set(expandedGroups);
    if (newExpandedGroups.has(groupName)) {
      newExpandedGroups.delete(groupName);
    } else {
      newExpandedGroups.add(groupName);
    }
    setExpandedGroups(newExpandedGroups);
  };

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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/95">
      {/* Professional Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/90 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onBack} 
                className="h-10 px-3 rounded-xl hover:bg-muted/80 transition-all duration-200"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                <span className="font-medium">Zurück</span>
              </Button>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-primary via-primary to-primary/80 rounded-2xl flex items-center justify-center shadow-lg ring-1 ring-primary/20">
                  <span className="text-sm font-bold text-primary-foreground">PP</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                    ProPlan
                  </h1>
                  <p className="text-sm text-muted-foreground">Wochenkalender</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Professional Week Navigation */}
        <Card className="rounded-2xl border-0 bg-card/50 backdrop-blur-sm shadow-lg ring-1 ring-border/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={goToPreviousWeek}
                  className="h-10 w-10 p-0 rounded-xl border-2 hover:scale-105 transition-all duration-200"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button 
                  variant="default" 
                  onClick={goToCurrentWeek} 
                  className="h-10 px-4 rounded-xl font-medium shadow-md hover:shadow-lg transition-all duration-200"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Heute
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={goToNextWeek}
                  className="h-10 w-10 p-0 rounded-xl border-2 hover:scale-105 transition-all duration-200"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </div>
            
            <div className="text-center space-y-1">
              <div className="text-2xl font-bold text-foreground">
                Kalenderwoche {getWeek(weekStart, { locale: de })}
              </div>
              <div className="text-muted-foreground">
                {format(weekStart, "dd. MMMM", { locale: de })} - {format(addDays(weekStart, 6), "dd. MMMM yyyy", { locale: de })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Professional Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="rounded-xl border-0 bg-card/50 backdrop-blur-sm shadow-md ring-1 ring-border/20">
            <CardContent className="p-4">
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="h-12 rounded-xl border-2 font-medium">
                  <SelectValue placeholder="Standort wählen" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Alle Standorte</SelectItem>
                  {Object.entries(locationLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-0 bg-card/50 backdrop-blur-sm shadow-md ring-1 ring-border/20">
            <CardContent className="p-4">
              <Select value={selectedProductGroup} onValueChange={setSelectedProductGroup}>
                <SelectTrigger className="h-12 rounded-xl border-2 font-medium">
                  <SelectValue placeholder="Produktgruppe wählen" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Alle Produktgruppen</SelectItem>
                  {productGroups.map(group => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Planning Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-lg ring-1 ring-primary/20">
            <CardContent className="p-6">
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                  {weeklyTotalQuantity.toLocaleString('de-DE', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  kg Gesamtmenge
                </div>
                <div className="text-xs text-primary/70">
                  Woche {getWeek(weekStart, { locale: de })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 bg-gradient-to-br from-secondary/10 via-secondary/5 to-transparent shadow-lg ring-1 ring-secondary/20">
            <CardContent className="p-6">
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold bg-gradient-to-r from-secondary to-secondary/80 bg-clip-text text-transparent">
                  {weeklyProjectCount}
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Aktive Projekte
                </div>
                <div className="text-xs text-secondary/70">
                  In Produktion
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent shadow-lg ring-1 ring-accent/20">
            <CardContent className="p-6">
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold bg-gradient-to-r from-accent to-accent/80 bg-clip-text text-transparent">
                  {Object.keys(totals.byProduct).length}
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Produktgruppen
                </div>
                <div className="text-xs text-accent/70">
                  Aktiv diese Woche
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 bg-gradient-to-br from-orange-100/50 via-orange-50/30 to-transparent shadow-lg ring-1 ring-orange-200/30">
            <CardContent className="p-6">
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
                  {Object.keys(totals.byLocation).length}
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Standorte
                </div>
                <div className="text-xs text-orange-600/70">
                  Mit Produktion
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Planning Overview Panels */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Quick Product Group Overview */}
          <Card className="xl:col-span-2 rounded-2xl border-0 bg-card/50 backdrop-blur-sm shadow-lg ring-1 ring-border/20">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary"></div>
                Produktgruppen-Schnellübersicht
              </CardTitle>
              <CardDescription>Aktuelle Woche - Mengen nach Produktgruppen</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(totals.byProduct).slice(0, 5).map(([product, quantity], index) => {
                  const percentage = (quantity / totals.totalQuantity) * 100;
                  const colors = ['bg-primary', 'bg-secondary', 'bg-accent', 'bg-orange-500', 'bg-green-500'];
                  return (
                    <div key={product} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-foreground">{product}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{quantity.toLocaleString('de-DE')} kg</span>
                          <span className="text-xs text-muted-foreground">({percentage.toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-muted/30 rounded-full h-2">
                        <div 
                          className={`${colors[index % colors.length]} h-2 rounded-full transition-all duration-300`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(totals.byProduct).length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    Keine Produktgruppen für diese Woche
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Location Capacity Overview */}
          <Card className="xl:col-span-2 rounded-2xl border-0 bg-card/50 backdrop-blur-sm shadow-lg ring-1 ring-border/20">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-secondary"></div>
                Standort-Kapazitäten
              </CardTitle>
              <CardDescription>Mengenverteilung nach Produktionsstandorten</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3">
                {Object.entries(totals.byLocation).map(([location, quantity]) => {
                  const percentage = totals.totalQuantity > 0 ? (quantity / totals.totalQuantity) * 100 : 0;
                  const locationColor = {
                    'brenz': 'bg-blue-500',
                    'visbek': 'bg-green-500', 
                    'doebeln': 'bg-yellow-500',
                    'storkow': 'bg-purple-500',
                    'gudensberg': 'bg-red-500'
                  }[location] || 'bg-gray-500';
                  
                  return (
                    <div key={location} className="p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${locationColor}`}></div>
                          <span className="font-semibold text-sm">{locationLabels[location as keyof typeof locationLabels] || location}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">{quantity.toLocaleString('de-DE')} kg</div>
                          <div className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="w-full bg-background/50 rounded-full h-2">
                        <div 
                          className={`${locationColor} h-2 rounded-full transition-all duration-300`}
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(totals.byLocation).length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    Keine Standortdaten für diese Woche
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Professional Data Table */}
        <Card className="rounded-2xl border-0 bg-card/50 backdrop-blur-sm shadow-xl ring-1 ring-border/20 overflow-hidden">
          <div className="border-b bg-gradient-to-r from-muted/30 via-muted/20 to-muted/30 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-foreground">Wochenplanung</h3>
                <p className="text-muted-foreground mt-1">
                  {filteredProjects.length + (previewProject ? 1 : 0)} Projekte für KW {getWeek(weekStart, { locale: de })}
                </p>
              </div>
              <Badge variant="secondary" className="px-3 py-1 text-sm font-medium">
                Live
              </Badge>
            </div>
          </div>

          {/* Professional Table Layout - Hierarchical Structure */}
          <div className="w-full">
            <div className="w-full">
              {/* Enhanced Header */}
              <div className="grid grid-cols-12 border-b bg-gradient-to-r from-muted/20 via-muted/10 to-muted/20">
                {/* Project Info Headers */}
                <div className="col-span-4 p-4 border-r border-border/50">
                  <div className="grid grid-cols-4 gap-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary/60"></div>
                      Rohware / Kunde
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-secondary/60"></div>
                      Art.-Nr.
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-accent/60"></div>
                      Bezeichnung
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary/60"></div>
                      Lieferung
                    </div>
                  </div>
                </div>
                
                {/* Location Headers */}
                <div className="col-span-3 p-4 border-r border-border/50">
                  <div className="grid grid-cols-5 gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                    {Object.entries(locationLabels).map(([key, label]) => (
                      <div key={key} className="flex flex-col items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-accent/60"></div>
                        <span className="truncate" title={label}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Calendar Headers */}
                <div className="col-span-5 p-4">
                  <div className="grid grid-cols-7 gap-2">
                    {weekDays.map((day, index) => {
                      const isToday = isSameDay(day, new Date());
                      const dateKey = format(day, 'yyyy-MM-dd');
                      const dayProductSums = dailySums[dateKey] || {};
                      
                      return (
                        <div key={index} className="text-center space-y-2">
                          <div className={`text-xs font-bold uppercase tracking-wider ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                            {format(day, "EE", { locale: de })}
                          </div>
                          <div className={`text-lg font-bold ${isToday ? 'text-primary bg-primary/10 rounded-lg py-1' : 'text-foreground'}`}>
                            {format(day, "dd")}
                          </div>
                          
                          {/* Product group sums for this day */}
                          <div className="space-y-1 mt-2">
                            {activeProductGroups.map(productGroup => {
                              const sum = dayProductSums[productGroup] || 0;
                              const colors = {
                                'Oberkeule': 'bg-blue-100 text-blue-800 border-blue-200',
                                'Unterschenkel': 'bg-green-100 text-green-800 border-green-200',
                                'Bauch': 'bg-yellow-100 text-yellow-800 border-yellow-200',
                                'Keule': 'bg-purple-100 text-purple-800 border-purple-200',
                                'Schulter': 'bg-red-100 text-red-800 border-red-200'
                              }[productGroup] || 'bg-gray-100 text-gray-800 border-gray-200';
                              
                              if (sum > 0) {
                                return (
                                  <div key={productGroup} className={`text-xs px-1 py-0.5 rounded border ${colors} font-medium`}>
                                    <div className="truncate" title={productGroup}>
                                      {productGroup.substring(0, 3)}
                                    </div>
                                    <div className="font-bold">
                                      {Math.round(sum).toLocaleString('de-DE')}
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Project Rows - Hierarchical Tree Structure */}
              <div className="divide-y divide-border/30">{loading ? (
                  <div className="text-center py-16">
                    <div className="inline-flex items-center gap-3 text-muted-foreground">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <span className="font-medium">Projekte werden geladen...</span>
                    </div>
                  </div>
                ) : filteredProjects.length === 0 && !previewProject ? (
                  <div className="text-center py-16">
                    <div className="space-y-2 text-muted-foreground">
                      <Calendar className="w-12 h-12 mx-auto opacity-50" />
                      <div className="font-medium">Keine Projekte für diese Woche geplant</div>
                      <div className="text-sm">Wählen Sie eine andere Woche oder passen Sie die Filter an</div>
                    </div>
                  </div>
                ) : (
                 <>
                   {/* Hierarchical Product Groups - Tree Structure */}
                  {(() => {
                    // Group projects by product group
                    const groupedProjects = filteredProjects.reduce((groups, project) => {
                      const group = project.produktgruppe || 'Ohne Produktgruppe';
                      if (!groups[group]) groups[group] = [];
                      groups[group].push(project);
                      return groups;
                    }, {} as Record<string, Project[]>);

                    return Object.entries(groupedProjects).map(([productGroup, projects]) => {
                      const isExpanded = expandedGroups.has(productGroup);
                      const groupTotalQuantity = projects.reduce((sum, p) => sum + p.gesamtmenge, 0);
                      
                      return (
                        <div key={productGroup}>
                          {/* Product Group Header Row - Collapsible */}
                          <div 
                            className="grid grid-cols-12 bg-gradient-to-r from-blue-50/80 via-blue-50/50 to-blue-50/20 border-l-4 border-l-blue-500 hover:from-blue-100/80 hover:via-blue-100/50 hover:to-blue-100/20 transition-all duration-200 cursor-pointer"
                            onClick={() => toggleGroup(productGroup)}
                          >
                            <div className="col-span-4 p-4 border-r border-border/50">
                              <div className="flex items-center gap-3">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-6 w-6 p-0 hover:bg-blue-200/50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroup(productGroup);
                                  }}
                                >
                                  {isExpanded ? 
                                    <Minus className="h-4 w-4 text-blue-600" /> : 
                                    <Plus className="h-4 w-4 text-blue-600" />
                                  }
                                </Button>
                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                <h4 className="font-bold text-lg text-blue-900">{productGroup}</h4>
                                <Badge variant="secondary" className="font-medium bg-blue-100 text-blue-800 border-blue-200">
                                  {projects.length} Projekt{projects.length !== 1 ? 'e' : ''}
                                </Badge>
                              </div>
                            </div>
                            <div className="col-span-3 p-4 border-r border-border/50 flex items-center justify-center">
                              <Badge variant="outline" className="font-bold bg-blue-50 border-blue-300 text-blue-800">
                                Σ {groupTotalQuantity.toLocaleString('de-DE')} kg
                              </Badge>
                            </div>
                            <div className="col-span-5 p-4 flex items-center justify-end">
                              <div className="text-sm text-blue-600 font-medium">
                                {isExpanded ? 'Einklappen' : 'Aufklappen'}
                              </div>
                            </div>
                          </div>
                          
                          {/* Individual Projects - Only show when expanded */}
                          {isExpanded && projects.map((project) => (
                            <div 
                              key={project.id}
                              className={`grid grid-cols-12 hover:bg-gradient-to-r hover:from-muted/20 hover:via-muted/10 hover:to-transparent transition-all duration-300 border-l-4 ${
                                selectedProject === project.id ? 'bg-primary/5 border-l-primary shadow-lg' : 'border-l-blue-200 hover:border-l-blue-400'
                              }`}
                            >
                              {/* Project Info */}
                              <div className="col-span-4 p-4 border-r border-border/50">
                                <div className="pl-8"> {/* Indented for hierarchy */}
                                  <div className="grid grid-cols-4 gap-3 items-start">
                                    <div className="space-y-1">
                                      <div className="font-semibold text-sm text-foreground truncate" title={project.customer}>
                                        {project.customer}
                                      </div>
                                      <Badge variant="secondary" className="text-xs font-bold bg-muted text-foreground border border-border/50">
                                        {project.gesamtmenge?.toLocaleString('de-DE')} kg
                                      </Badge>
                                    </div>
                                    <div>
                                      <div className="text-xs font-mono bg-muted/50 px-2 py-1 rounded text-muted-foreground border">
                                        {project.artikel_nummer}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium text-foreground line-clamp-2 leading-relaxed" title={project.artikel_bezeichnung}>
                                        {project.artikel_bezeichnung}
                                      </div>
                                    </div>
                                    <div className="text-center space-y-1">
                                      <div className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md">
                                        {project.erste_anlieferung ? format(parseLocalDate(project.erste_anlieferung), "dd.MM.yy", { locale: de }) : '-'}
                                      </div>
                                      <div className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md">
                                        {project.letzte_anlieferung ? format(parseLocalDate(project.letzte_anlieferung), "dd.MM.yy", { locale: de }) : '-'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                       
                       {/* Enhanced Location Columns with Visual Indicators */}
                       <div className="col-span-3 p-4 border-r border-border/50">
                         <div className="grid grid-cols-5 gap-2 h-full">
                           {Object.keys(locationLabels).map((locationKey) => {
                             const quantity = project.standort_verteilung?.[locationKey] || 0;
                             const qty = Number(quantity);
                             const totalProjectQty = project.gesamtmenge || 1;
                             const percentage = (qty / totalProjectQty) * 100;
                             
                             const locationColors = {
                               'brenz': 'bg-blue-500 border-blue-200 text-blue-50',
                               'visbek': 'bg-green-500 border-green-200 text-green-50', 
                               'doebeln': 'bg-yellow-500 border-yellow-200 text-yellow-900',
                               'storkow': 'bg-purple-500 border-purple-200 text-purple-50',
                               'gudensberg': 'bg-red-500 border-red-200 text-red-50'
                             }[locationKey] || 'bg-gray-500 border-gray-200 text-gray-50';
                             
                             return (
                               <div key={locationKey} className="text-center space-y-2">
                                 {qty > 0 ? (
                                   <div className={`${locationColors} rounded-xl px-3 py-3 text-xs font-bold border-2 shadow-lg relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-105`}>
                                     <div className="relative z-10 space-y-1">
                                       <div className="font-black text-sm tracking-wide">
                                         {qty.toLocaleString('de-DE')}
                                       </div>
                                       <div className="text-xs font-semibold opacity-95 tracking-wider">
                                         {percentage.toFixed(0)}%
                                       </div>
                                     </div>
                                     <div 
                                       className="absolute bottom-0 left-0 bg-white/20 transition-all duration-500 rounded-t-lg" 
                                       style={{
                                         height: `${Math.max(percentage * 0.8, 8)}%`,
                                         width: '100%'
                                       }}
                                     ></div>
                                   </div>
                                 ) : (
                                   <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl py-4 px-3 border-2 border-dashed border-muted/50 hover:bg-muted/40 transition-colors duration-200">
                                     <div className="font-medium text-sm">-</div>
                                     <div className="text-xs font-medium opacity-70">0%</div>
                                   </div>
                                 )}
                               </div>
                             );
                           })}
                         </div>
                       </div>
                       
                       {/* Timeline - Show project span if it overlaps with current week */}
                       <div className="col-span-5 p-4 relative">
                         <div className="relative h-12">
                           {/* Grid lines */}
                           <div className="absolute inset-0 grid grid-cols-7 gap-0 pointer-events-none">
                             {weekDays.map((_, index) => (
                               <div key={index} className="flex justify-center">
                                 <div className="w-px bg-border/30 h-full" />
                               </div>
                             ))}
                           </div>
                           
                           {/* Project bar - only show if project overlaps with current week */}
                           {(() => {
                             if (!project.erste_anlieferung || !project.letzte_anlieferung) return null;
                             
                             try {
                               const startDate = parseLocalDate(project.erste_anlieferung);
                               const endDate = parseLocalDate(project.letzte_anlieferung);
                               const weekEnd = addDays(weekStart, 6);
                               
                               // Check if project overlaps with current week
                               if (startDate > weekEnd || endDate < weekStart) return null;
                               
                               let startDay = -1;
                               let endDay = -1;
                               
                               weekDays.forEach((day, index) => {
                                 if (startDate <= day && endDate >= day) {
                                   if (startDay === -1) startDay = index;
                                   endDay = index;
                                 }
                               });
                               
                               if (startDay === -1 || endDay === -1) return null;
                               
                               return (
                                 <div
                                   className={`absolute rounded-md border transition-all duration-200 cursor-pointer ${
                                     selectedProject === project.id
                                       ? 'bg-primary/20 border-primary ring-2 ring-primary/30'
                                       : 'bg-blue-100 border-blue-300 hover:bg-blue-200'
                                   }`}
                                   style={{
                                     left: `${(startDay / 7) * 100}%`,
                                     width: `${((endDay - startDay + 1) / 7) * 100}%`,
                                     height: '40px',
                                     top: '4px'
                                   }}
                                   onClick={() => {
                                     setSelectedProject(selectedProject === project.id ? null : project.id);
                                     if (onShowProjectDetails) {
                                       onShowProjectDetails(project);
                                     }
                                   }}
                                 >
                                   <div className="p-2 h-full flex items-center justify-between">
                                     <span className="text-xs font-medium text-foreground truncate">
                                       {project.gesamtmenge?.toLocaleString('de-DE')} kg
                                     </span>
                                     <span className="text-xs text-muted-foreground">
                                       {Math.abs(differenceInCalendarDays(endDate, startDate)) + 1}d
                                     </span>
                                   </div>
                                 </div>
                               );
                             } catch (error) {
                               console.error('Error calculating project timeline:', error);
                               return null;
                             }
                           })()}
                         </div>
                       </div>
                     </div>
                          ))}
                        </div>
                      );
                    });
                  })()}

                   {/* Preview Project */}
                  {previewProject && (() => {
                    const previewSpan = projectSpans.find(span => span.isPreview);
                    if (!previewSpan) return null;
                    
                    return (
                      <div key="preview" className="grid grid-cols-12 bg-orange-50/50 border-l-4 border-l-orange-400">
                        {/* Project Info */}
                        <div className="col-span-4 p-4 border-r">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="secondary" className="bg-orange-100 text-orange-700 font-semibold">
                                Vorschau
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-5 gap-2 items-start">
                              <div>
                                <div className="font-semibold text-sm text-foreground truncate" title={previewProject.customer}>
                                  {previewProject.customer}
                                </div>
                                <Badge variant="outline" className="text-xs mt-1">
                                  {previewProject.produktgruppe || 'N/A'}
                                </Badge>
                              </div>
                              <div>
                                <div className="text-xs font-mono text-muted-foreground">
                                  {previewProject.artikel_nummer}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-medium text-foreground line-clamp-2" title={previewProject.artikel_bezeichnung}>
                                  {previewProject.artikel_bezeichnung}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-primary">
                                  {previewProject.erste_anlieferung ? format(parseLocalDate(previewProject.erste_anlieferung), "dd.MM.yy", { locale: de }) : '-'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-secondary-foreground">
                                  {previewProject.letzte_anlieferung ? format(parseLocalDate(previewProject.letzte_anlieferung), "dd.MM.yy", { locale: de }) : '-'}
                                </div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Erste:</span>
                                <div className="font-semibold text-primary">
                                  {previewProject.erste_anlieferung ? format(parseLocalDate(previewProject.erste_anlieferung), "dd.MM.yy", { locale: de }) : '-'}
                                </div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Letzte:</span>
                                <div className="font-semibold text-secondary-foreground">
                                  {previewProject.letzte_anlieferung ? format(parseLocalDate(previewProject.letzte_anlieferung), "dd.MM.yy", { locale: de }) : '-'}
                                </div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Gesamt:</span>
                                <div className="font-bold text-foreground">
                                  {previewProject.gesamtmenge?.toLocaleString('de-DE')} kg
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Enhanced Location Columns for Preview */}
                        <div className="col-span-3 p-5 border-r border-border/50">
                          <div className="grid grid-cols-5 gap-2 h-full">
                            {Object.keys(locationLabels).map((locationKey) => {
                              const quantity = previewProject.standort_verteilung?.[locationKey] || 0;
                              const qty = Number(quantity);
                              const totalProjectQty = previewProject.gesamtmenge || 1;
                              const percentage = (qty / totalProjectQty) * 100;
                              
                              return (
                                <div key={locationKey} className="text-center space-y-1">
                                  {qty > 0 ? (
                                    <div className="bg-orange-400 border-orange-200 text-orange-50 rounded-lg px-2 py-2 text-xs font-bold border-2 shadow-sm relative overflow-hidden">
                                      <div className="relative z-10">
                                        <div className="font-bold">{qty.toLocaleString('de-DE')}</div>
                                        <div className="text-xs opacity-90">{percentage.toFixed(0)}%</div>
                                      </div>
                                      <div 
                                        className="absolute bottom-0 left-0 bg-white/20 transition-all duration-300" 
                                        style={{
                                          height: `${Math.max(percentage * 0.8, 8)}%`,
                                          width: '100%'
                                        }}
                                      ></div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg py-3 px-2 border-2 border-dashed border-muted/40">
                                      <div>-</div>
                                      <div className="text-xs">0%</div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                        {/* Timeline */}
                        <div className="col-span-5 p-4 relative">
                          <div className="relative h-12">
                            <div className="absolute inset-0 grid grid-cols-7 gap-0 pointer-events-none">
                              {weekDays.map((_, index) => (
                                <div key={index} className="flex justify-center">
                                  <div className="w-px bg-border/30 h-full" />
                                </div>
                              ))}
                            </div>
                            
                            <div
                              className="absolute rounded-md border-2 border-dashed border-orange-400 bg-orange-100"
                              style={{
                                left: `${(previewSpan.startDay / 7) * 100}%`,
                                width: `${((previewSpan.endDay - previewSpan.startDay + 1) / 7) * 100}%`,
                                height: '40px',
                                top: '4px'
                              }}
                            >
                              <div className="p-2 h-full flex items-center justify-between">
                                <span className="text-xs font-medium text-orange-800 truncate">
                                  {previewProject.gesamtmenge?.toLocaleString('de-DE')} kg
                                </span>
                                <span className="text-xs text-orange-600">
                                  Vorschau
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Professional Summary Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Location */}
          <Card className="rounded-2xl border-0 bg-card/50 backdrop-blur-sm shadow-lg ring-1 ring-border/20">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold">Standort-Übersicht</CardTitle>
              <CardDescription>Mengenverteilung nach Standorten</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(totals.byLocation).map(([location, quantity]) => (
                <div key={location} className="flex justify-between items-center p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                  <span className="font-medium">{locationLabels[location as keyof typeof locationLabels] || location}</span>
                  <Badge variant="secondary" className="font-bold px-3 py-1">
                    {quantity.toLocaleString('de-DE')} kg
                  </Badge>
                </div>
              ))}
              {Object.keys(totals.byLocation).length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div className="font-medium">Keine Daten verfügbar</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* By Product Group */}
          <Card className="rounded-2xl border-0 bg-card/50 backdrop-blur-sm shadow-lg ring-1 ring-border/20">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold">Produktgruppen-Übersicht</CardTitle>
              <CardDescription>Mengenverteilung nach Produktgruppen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(totals.byProduct).map(([product, quantity]) => (
                <div key={product} className="flex justify-between items-center p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                  <span className="font-medium">{product}</span>
                  <Badge variant="secondary" className="font-bold px-3 py-1">
                    {quantity.toLocaleString('de-DE')} kg
                  </Badge>
                </div>
              ))}
              {Object.keys(totals.byProduct).length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div className="font-medium">Keine Daten verfügbar</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};