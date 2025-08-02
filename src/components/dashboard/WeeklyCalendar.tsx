import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { de } from "date-fns/locale";

interface Project {
  id: string;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  gesamtmenge: number;
  status: string;
  created_at: string;
  updated_at: string;
  created_by_id: string;
  created_by_name: string;
  standort_verteilung: any;
  menge_fix: boolean;
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

export const WeeklyCalendar = ({ user, onBack }: WeeklyCalendarProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [selectedProductGroup, setSelectedProductGroup] = useState<string>("all");
  const { toast } = useToast();

  // Get unique product groups from projects
  const productGroups = Array.from(new Set(projects.map(p => p.artikel_bezeichnung))).sort();

  // Load approved projects
  useEffect(() => {
    const loadApprovedProjects = async () => {
      try {
        const { data, error } = await supabase
          .from('manufacturing_projects')
          .select('*')
          .eq('status', 'approved')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setProjects(data || []);
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
      project.artikel_bezeichnung === selectedProductGroup;

    return locationMatch && productMatch;
  });

  // Calculate totals for current week
  const calculateTotals = () => {
    const totals = {
      totalQuantity: 0,
      byLocation: {} as Record<string, number>,
      byProduct: {} as Record<string, number>
    };

    filteredProjects.forEach(project => {
      totals.totalQuantity += project.gesamtmenge;
      
      // By product
      if (!totals.byProduct[project.artikel_bezeichnung]) {
        totals.byProduct[project.artikel_bezeichnung] = 0;
      }
      totals.byProduct[project.artikel_bezeichnung] += project.gesamtmenge;

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
              <div>
                <h1 className="text-2xl font-bold">Wochenkalender - Genehmigte Projekte</h1>
                <p className="text-muted-foreground">
                  Übersicht aller genehmigten Projekte nach Standorten
                </p>
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
                {format(weekStart, "dd.MM.yyyy", { locale: de })} - {format(addDays(weekStart, 6), "dd.MM.yyyy", { locale: de })}
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
                <div className="text-2xl font-bold">{totals.totalQuantity.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Stück</p>
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

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-4">
            {weekDays.map((day, index) => {
              const dayProjects = filteredProjects.filter(project => {
                const projectDate = new Date(project.updated_at);
                return isSameDay(projectDate, day);
              });

              return (
                <Card key={index} className="min-h-[200px]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      {format(day, "EEE dd.MM", { locale: de })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {dayProjects.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Keine Projekte</p>
                    ) : (
                      dayProjects.map(project => (
                        <div key={project.id} className="p-2 rounded border bg-green-50">
                          <div className="font-medium text-xs">{project.customer}</div>
                          <div className="text-xs text-muted-foreground">
                            {project.artikel_bezeichnung}
                          </div>
                          <div className="text-xs font-medium">
                            {project.gesamtmenge.toLocaleString()} Stück
                          </div>
                          {project.standort_verteilung && typeof project.standort_verteilung === 'object' && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(project.standort_verteilung)
                                .filter(([_, quantity]) => Number(quantity) > 0)
                                .map(([location, quantity]) => (
                                <Badge key={location} variant="secondary" className="text-xs">
                                  {locationLabels[location as keyof typeof locationLabels]}: {Number(quantity)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
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
                      <Badge variant="outline">{quantity.toLocaleString()} Stück</Badge>
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
                      <Badge variant="outline">{quantity.toLocaleString()} Stück</Badge>
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