import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Hilfsfunktionen für Zahlenformatierung
const formatNumberWithThousandSeparator = (value: number): string => {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.round(value));
};

const parseFormattedNumber = (value: string): number => {
  // Entferne Tausendertrennzeichen und ersetze Komma durch Punkt
  const cleanedValue = value.replace(/\./g, '').replace(',', '.');
  return Math.round(parseFloat(cleanedValue) || 0);
};

const locations = [
  { value: "gudensberg", label: "Gudensberg" },
  { value: "brenz", label: "Brenz" },
  { value: "storkow", label: "Storkow" },
  { value: "visbek", label: "Visbek" },
  { value: "doebeln", label: "Döbeln" },
];

const projectSchema = z.object({
  customer: z.string().min(1, "Kunde ist erforderlich"),
  artikel_nummer: z.string().min(1, "Artikelnummer ist erforderlich"),
  artikel_bezeichnung: z.string().min(1, "Artikelbezeichnung ist erforderlich"),
  produktgruppe: z.string().min(1, "Produktgruppe ist erforderlich"),
  gesamtmenge: z.number().min(0.1, "Gesamtmenge muss größer als 0 sein"),
  beschreibung: z.string().optional(),
  
  erste_anlieferung: z.date().optional(),
  letzte_anlieferung: z.date().optional(),
  menge_fix: z.boolean().default(false),
  standort_verteilung: z.record(z.number().min(0)).refine(
    (data) => {
      const total = Object.values(data).reduce((sum, val) => sum + val, 0);
      return total > 0;
    },
    { message: "Mindestens ein Standort muss eine Menge haben" }
  ),
}).refine((data) => {
  if (data.erste_anlieferung && data.letzte_anlieferung) {
    return data.erste_anlieferung <= data.letzte_anlieferung;
  }
  return true;
}, {
  message: "Erste Anlieferung muss vor oder gleich der letzten Anlieferung sein",
  path: ["letzte_anlieferung"]
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface User {
  id: string;
  email: string;
  role: "vertrieb" | "supply_chain" | "planung" | "planung_storkow" | "planung_brenz" | "planung_gudensberg" | "planung_doebeln" | "planung_visbek" | "admin";
  full_name?: string;
}

interface ProjectFormProps {
  user: User;
  onSuccess: () => void;
  onCancel: () => void;
}

export const ProjectForm = ({ user, onSuccess, onCancel }: ProjectFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [locationQuantities, setLocationQuantities] = useState<Record<string, number>>({
    gudensberg: 0.0,
    brenz: 0.0,
    storkow: 0.0,
    visbek: 0.0,
    doebeln: 0.0,
  });
  
  const { toast } = useToast();

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      customer: "",
      artikel_nummer: "",
      artikel_bezeichnung: "",
      produktgruppe: "",
      gesamtmenge: 0.0,
      beschreibung: "",
      
      erste_anlieferung: undefined,
      letzte_anlieferung: undefined,
      menge_fix: false,
      standort_verteilung: locationQuantities,
    },
  });

  // Remove mock customers - we'll use direct input for customer name
  useEffect(() => {
    // Auto-distribute quantities when gesamtmenge changes
    const subscription = form.watch((value, { name }) => {
      if (name === "gesamtmenge" && value.gesamtmenge) {
        // Keep existing distribution if already set
      }
    });
    return subscription.unsubscribe;
  }, [form.watch]);

  const gesamtmenge = form.watch("gesamtmenge");
  const totalDistributed = Object.values(locationQuantities).reduce((sum, val) => sum + val, 0);

  const handleLocationQuantityChange = (location: string, value: number) => {
    const newQuantities = { ...locationQuantities, [location]: value };
    setLocationQuantities(newQuantities);
    form.setValue("standort_verteilung", newQuantities);
  };

  const onSubmit = async (data: ProjectFormData) => {
    if (totalDistributed > gesamtmenge) {
      toast({
        title: "Fehler",
        description: "Die Verteilung übersteigt die Gesamtmenge",
        variant: "destructive",
      });
      return;
    }

    if (totalDistributed === 0) {
      toast({
        title: "Fehler",
        description: "Mindestens ein Standort muss eine Menge haben",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        throw new Error("Nicht angemeldet");
      }

      const { data: inserted, error } = await supabase
        .from('manufacturing_projects')
        .insert({
          customer: data.customer,
          artikel_nummer: data.artikel_nummer,
          artikel_bezeichnung: data.artikel_bezeichnung,
          produktgruppe: data.produktgruppe,
          gesamtmenge: data.gesamtmenge,
          beschreibung: data.beschreibung,
          
          erste_anlieferung: data.erste_anlieferung ? format(data.erste_anlieferung, 'yyyy-MM-dd') : null,
          letzte_anlieferung: data.letzte_anlieferung ? format(data.letzte_anlieferung, 'yyyy-MM-dd') : null,
          menge_fix: data.menge_fix,
          standort_verteilung: data.standort_verteilung,
          status: 'pending', // Start as pending for SupplyChain review
          created_by_id: currentUser.id,
          created_by_name: user.full_name || user.email
        })
        .select('id')
        .single();

      if (error) throw error;

      // Aktivität 'create' protokollieren
      await supabase.from('project_history').insert({
        project_id: inserted.id,
        user_id: currentUser.id,
        user_name: user.full_name || user.email,
        action: 'create',
        previous_status: null,
        new_status: 'pending'
      });
      
      toast({
        title: "Projekt erstellt",
        description: "Das Projekt wurde erfolgreich erstellt und an Supply Chain weitergeleitet.",
      });
      
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Fehler beim Erstellen des Projekts",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="text-center border-b">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary rounded-xl flex items-center justify-center">
            <span className="text-lg sm:text-xl font-bold text-primary-foreground">PP</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-primary">ProPlan</h2>
          </div>
        </div>
        <CardTitle className="text-xl sm:text-2xl">Neues Projekt erfassen</CardTitle>
        <CardDescription className="text-sm sm:text-base">
          Erfassen Sie ein neues Projekt mit Standortverteilung
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="customer">Kunde</Label>
              <Input
                id="customer"
                {...form.register("customer")}
              />
              {form.formState.errors.customer && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.customer.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="artikel_nummer">Artikelnummer</Label>
              <Input
                id="artikel_nummer"
                {...form.register("artikel_nummer")}
              />
              {form.formState.errors.artikel_nummer && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.artikel_nummer.message}
                </p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="artikel_bezeichnung">Artikelbezeichnung</Label>
              <Input
                id="artikel_bezeichnung"
                {...form.register("artikel_bezeichnung")}
              />
              {form.formState.errors.artikel_bezeichnung && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.artikel_bezeichnung.message}
                </p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="produktgruppe">Produktgruppe</Label>
              <Input
                id="produktgruppe"
                {...form.register("produktgruppe")}
              />
              {form.formState.errors.produktgruppe && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.produktgruppe.message}
                </p>
              )}
            </div>


            {/* Erste und letzte Anlieferung nebeneinander */}
            <div className="space-y-2">
              <Label>Erste Anlieferung</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !form.watch("erste_anlieferung") && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch("erste_anlieferung") 
                      ? format(form.watch("erste_anlieferung")!, "dd.MM.yyyy", { locale: de })
                      : "Datum wählen"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.watch("erste_anlieferung")}
                    onSelect={(date) => form.setValue("erste_anlieferung", date)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {form.formState.errors.erste_anlieferung && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.erste_anlieferung.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Letzte Anlieferung</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !form.watch("letzte_anlieferung") && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch("letzte_anlieferung") 
                      ? format(form.watch("letzte_anlieferung")!, "dd.MM.yyyy", { locale: de })
                      : "Datum wählen"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.watch("letzte_anlieferung")}
                    onSelect={(date) => form.setValue("letzte_anlieferung", date)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {form.formState.errors.letzte_anlieferung && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.letzte_anlieferung.message}
                </p>
              )}
            </div>

            {/* Gesamtmenge und Menge fix nebeneinander - nach Anlieferungsdaten */}
            <div className="space-y-2">
              <Label htmlFor="gesamtmenge">Gesamtmenge (kg)</Label>
              <Input
                id="gesamtmenge"
                type="text"
                value={gesamtmenge > 0 ? formatNumberWithThousandSeparator(gesamtmenge) : ''}
                onChange={(e) => {
                  const value = parseFormattedNumber(e.target.value);
                  form.setValue("gesamtmenge", value);
                }}
                placeholder="0"
              />
              {form.formState.errors.gesamtmenge && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.gesamtmenge.message}
                </p>
              )}
            </div>

            <div className="space-y-2 flex flex-col justify-end">
              <div className="flex items-center space-x-2 h-10">
                <Checkbox
                  id="menge_fix"
                  checked={form.watch("menge_fix")}
                  onCheckedChange={(checked) => form.setValue("menge_fix", !!checked)}
                />
                <Label htmlFor="menge_fix">Menge fix</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Wenn aktiviert, kann die Menge nicht mehr geändert werden
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Standortverteilung</h3>
              <div className="text-sm">
                <span className={totalDistributed > gesamtmenge ? "text-destructive" : "text-muted-foreground"}>
                  Verteilt: {formatNumberWithThousandSeparator(totalDistributed)} kg / {formatNumberWithThousandSeparator(gesamtmenge)} kg
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations.map((location) => (
                <div key={location.value} className="space-y-2">
                  <Label htmlFor={location.value}>{location.label} (kg)</Label>
                  <Input
                    id={location.value}
                    type="text"
                    value={locationQuantities[location.value] > 0 ? formatNumberWithThousandSeparator(locationQuantities[location.value]) : ''}
                    onChange={(e) => {
                      const value = parseFormattedNumber(e.target.value);
                      handleLocationQuantityChange(location.value, value);
                    }}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
            
            {totalDistributed > gesamtmenge && (
              <p className="text-sm text-destructive">
                ⚠️ Die Standortverteilung ({formatNumberWithThousandSeparator(totalDistributed)} kg) übersteigt die Gesamtmenge ({formatNumberWithThousandSeparator(gesamtmenge)} kg)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="beschreibung">Projektbeschreibung (optional)</Label>
            <Textarea
              id="beschreibung"
              {...form.register("beschreibung")}
              placeholder="Beschreibung des Projekts..."
              rows={4}
            />
            {form.formState.errors.beschreibung && (
              <p className="text-sm text-destructive">
                {form.formState.errors.beschreibung.message}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4">
            <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={isLoading || totalDistributed > gesamtmenge}
              className="w-full sm:w-auto"
            >
              {isLoading ? "Wird erstellt..." : "Projekt erstellen"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
