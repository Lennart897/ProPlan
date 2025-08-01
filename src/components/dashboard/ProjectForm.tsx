import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const locations = [
  { value: "gudensberg", label: "Gudensberg" },
  { value: "brenz", label: "Brenz" },
  { value: "storkow", label: "Storkow" },
  { value: "visbek", label: "Visbek" },
  { value: "doebeln", label: "Döbeln" },
];

const projectSchema = z.object({
  customer_id: z.string().min(1, "Kunde muss ausgewählt werden"),
  artikel_nummer: z.string().min(1, "Artikelnummer ist erforderlich"),
  artikel_bezeichnung: z.string().min(1, "Artikelbezeichnung ist erforderlich"),
  gesamtmenge: z.number().min(1, "Gesamtmenge muss größer als 0 sein"),
  menge_fix: z.boolean().default(false),
  standort_verteilung: z.record(z.number().min(0)).refine(
    (data) => {
      const total = Object.values(data).reduce((sum, val) => sum + val, 0);
      return total > 0;
    },
    { message: "Mindestens ein Standort muss eine Menge haben" }
  ),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface Customer {
  id: string;
  name: string;
}

interface ProjectFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const ProjectForm = ({ onSuccess, onCancel }: ProjectFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locationQuantities, setLocationQuantities] = useState<Record<string, number>>({
    muenchen: 0,
    berlin: 0,
    hamburg: 0,
    koeln: 0,
    frankfurt: 0,
  });
  
  const { toast } = useToast();

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      customer_id: "",
      artikel_nummer: "",
      artikel_bezeichnung: "",
      gesamtmenge: 0,
      menge_fix: false,
      standort_verteilung: locationQuantities,
    },
  });

  // Mock customers data - will be replaced with actual Supabase query
  useEffect(() => {
    setCustomers([
      { id: "1", name: "BMW AG" },
      { id: "2", name: "Siemens AG" },
      { id: "3", name: "SAP SE" },
    ]);
  }, []);

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
      // Here we would save to Supabase
      console.log("Projekt erstellen:", data);
      
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
      <CardHeader>
        <CardTitle className="text-2xl">Neues Projekt erfassen</CardTitle>
        <CardDescription>
          Erfassen Sie ein neues Projekt mit Standortverteilung
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="customer">Kunde</Label>
              <Select onValueChange={(value) => form.setValue("customer_id", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Kunde auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.customer_id && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.customer_id.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="artikel_nummer">Artikelnummer</Label>
              <Input
                id="artikel_nummer"
                {...form.register("artikel_nummer")}
                placeholder="z.B. ART-001"
              />
              {form.formState.errors.artikel_nummer && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.artikel_nummer.message}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="artikel_bezeichnung">Artikelbezeichnung</Label>
              <Input
                id="artikel_bezeichnung"
                {...form.register("artikel_bezeichnung")}
                placeholder="z.B. Hochwertige Metallkomponente"
              />
              {form.formState.errors.artikel_bezeichnung && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.artikel_bezeichnung.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="gesamtmenge">Gesamtmenge</Label>
              <Input
                id="gesamtmenge"
                type="number"
                {...form.register("gesamtmenge", { valueAsNumber: true })}
                placeholder="1000"
              />
              {form.formState.errors.gesamtmenge && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.gesamtmenge.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
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
                  Verteilt: {totalDistributed} / {gesamtmenge}
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations.map((location) => (
                <div key={location.value} className="space-y-2">
                  <Label htmlFor={location.value}>{location.label}</Label>
                  <Input
                    id={location.value}
                    type="number"
                    min="0"
                    value={locationQuantities[location.value]}
                    onChange={(e) => 
                      handleLocationQuantityChange(location.value, parseInt(e.target.value) || 0)
                    }
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
            
            {totalDistributed > gesamtmenge && (
              <p className="text-sm text-destructive">
                ⚠️ Die Standortverteilung ({totalDistributed}) übersteigt die Gesamtmenge ({gesamtmenge})
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={isLoading || totalDistributed > gesamtmenge}
            >
              {isLoading ? "Wird erstellt..." : "Projekt erstellen"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
