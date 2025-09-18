import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  User, 
  Package, 
  Building2, 
  Truck, 
  Clock, 
  MapPin, 
  FileText,
  Upload
} from "lucide-react";
import { useLocations } from "@/hooks/useLocations";
import { useCustomers } from "@/hooks/useCustomers";
import { useArticles } from "@/hooks/useArticles";
import { CustomerSelector } from "@/components/selectors/CustomerSelector";
import { ArticleSelector } from "@/components/selectors/ArticleSelector";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Helper functions for number formatting
function formatNumberWithThousandSeparator(value: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 0 });
}

function parseFormattedNumber(value: string): number {
  const cleanedValue = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleanedValue) || 0;
}

const projectSchema = z.object({
  customer_id: z.string().min(1, "Kunde ist erforderlich"),
  article_id: z.string().min(1, "Artikel ist erforderlich"),
  gesamtmenge: z.number().min(0.1, "Gesamtmenge muss größer als 0 sein"),
  beschreibung: z.string().optional(),
  
  erste_anlieferung: z.date().optional(),
  letzte_anlieferung: z.date().optional(),
  menge_fix: z.boolean().default(false),
  attachment: z.instanceof(File).optional().refine(
    (file) => !file || file.size <= 5 * 1024 * 1024,
    { message: "Datei darf maximal 5MB groß sein" }
  ),
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
  role: string;
}

interface ProjectFormProps {
  user: User;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProjectForm({ user, onSuccess, onCancel }: ProjectFormProps) {
  const { toast } = useToast();
  const { locationOptions } = useLocations();
  const { getCustomerById } = useCustomers();
  const { getArticleById } = useArticles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      customer_id: "",
      article_id: "",
      gesamtmenge: 0,
      beschreibung: "",
      erste_anlieferung: undefined,
      letzte_anlieferung: undefined,
      menge_fix: false,
      standort_verteilung: {},
    },
  });

  // Initialize location distribution when locations are loaded
  useEffect(() => {
    if (locationOptions.length > 0) {
      const initialDistribution = locationOptions.reduce((acc, location) => {
        acc[location.value] = 0;
        return acc;
      }, {} as Record<string, number>);
      form.setValue("standort_verteilung", initialDistribution);
    }
  }, [locationOptions, form]);

  // Helper to update location distribution
  const updateLocationQuantity = (locationCode: string, quantity: number) => {
    const currentDistribution = form.getValues("standort_verteilung");
    form.setValue("standort_verteilung", {
      ...currentDistribution,
      [locationCode]: quantity,
    });
  };

  const onSubmit = async (data: ProjectFormData) => {
    setIsSubmitting(true);
    
    try {
      // Get customer and article data for display
      const customer = getCustomerById(data.customer_id);
      const article = getArticleById(data.article_id);
      
      if (!customer || !article) {
        throw new Error("Kunde oder Artikel nicht gefunden");
      }

      let attachmentUrl = null;
      let originalFilename = null;

      // Handle file upload if present
      if (data.attachment) {
        setUploadProgress(10);
        const fileExt = data.attachment.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        originalFilename = data.attachment.name;

        setUploadProgress(50);
        const { error: uploadError } = await supabase.storage
          .from('project-attachments')
          .upload(fileName, data.attachment);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error(`Datei-Upload fehlgeschlagen: ${uploadError.message}`);
        }

        setUploadProgress(80);
        const { data: { publicUrl } } = supabase.storage
          .from('project-attachments')
          .getPublicUrl(fileName);
        
        attachmentUrl = publicUrl;
      }

      setUploadProgress(90);

      // Prepare project data with both legacy fields and new references
      const projectData = {
        customer: customer.name,
        customer_id: data.customer_id,
        artikel_nummer: article.artikel_nummer,
        artikel_bezeichnung: article.artikel_bezeichnung,
        article_id: data.article_id,
        produktgruppe: article.produktgruppe,
        produktgruppe_2: article.produktgruppe_2,
        gesamtmenge: data.gesamtmenge,
        beschreibung: data.beschreibung || "",
        erste_anlieferung: data.erste_anlieferung || null,
        letzte_anlieferung: data.letzte_anlieferung || null,
        menge_fix: data.menge_fix,
        standort_verteilung: data.standort_verteilung,
        attachment_url: attachmentUrl,
        original_filename: originalFilename,
        created_by_id: user.id,
        created_by_name: user.email,
        status: 3, // Prüfung SupplyChain
      };

      const { data: project, error } = await supabase
        .from("manufacturing_projects")
        .insert([projectData])
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      // Add project history entry
      await supabase.from("project_history").insert([
        {
          project_id: project.id,
          user_id: user.id,
          user_name: user.email,
          action: "Projekt erstellt",
          new_status: "Prüfung SupplyChain",
        },
      ]);

      setUploadProgress(100);
      
      toast({
        title: "Projekt erstellt",
        description: `Projekt ${project.project_number} wurde erfolgreich erstellt.`,
      });

      onSuccess();
    } catch (error: any) {
      console.error("Error creating project:", error);
      toast({
        title: "Fehler",
        description: error.message || "Fehler beim Erstellen des Projekts",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  // Calculate total distributed quantity
  const distributedTotal = Object.values(form.watch("standort_verteilung") || {}).reduce(
    (sum, qty) => sum + (qty || 0), 
    0
  );
  const totalQuantity = form.watch("gesamtmenge") || 0;
  const isOverDistributed = distributedTotal > totalQuantity;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Customer Information */}
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-primary">
              <User className="h-5 w-5" />
              Kundendaten
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="customer_id" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Kunde
                </Label>
                <Controller
                  name="customer_id"
                  control={form.control}
                  render={({ field }) => (
                    <CustomerSelector
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Kunde auswählen"
                    />
                  )}
                />
                {form.formState.errors.customer_id && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.customer_id.message}
                  </p>
                )}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="beschreibung" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Projektbeschreibung
                </Label>
                <Textarea
                  id="beschreibung"
                  {...form.register("beschreibung")}
                  placeholder="Beschreibung des Projekts (optional)"
                  rows={3}
                />
                {form.formState.errors.beschreibung && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.beschreibung.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Information */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-blue-600">
              <Package className="h-5 w-5" />
              Produktdaten
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="article_id" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Artikel
                </Label>
                <Controller
                  name="article_id"
                  control={form.control}
                  render={({ field }) => (
                    <ArticleSelector
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Artikel auswählen"
                    />
                  )}
                />
                {form.formState.errors.article_id && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.article_id.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="gesamtmenge" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Gesamtmenge
                </Label>
                <Input
                  id="gesamtmenge"
                  type="number"
                  step="0.01"
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
                  <Label htmlFor="menge_fix" className="text-sm">
                    Menge fix
                  </Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Information */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-green-600">
              <Truck className="h-5 w-5" />
              Lieferinformationen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="erste_anlieferung" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Erste Anlieferung
                </Label>
                <Input
                  id="erste_anlieferung"
                  type="date"
                  {...form.register("erste_anlieferung", {
                    setValueAs: (value) => value ? new Date(value) : undefined,
                  })}
                />
                {form.formState.errors.erste_anlieferung && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.erste_anlieferung.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="letzte_anlieferung" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Letzte Anlieferung
                </Label>
                <Input
                  id="letzte_anlieferung"
                  type="date"
                  {...form.register("letzte_anlieferung", {
                    setValueAs: (value) => value ? new Date(value) : undefined,
                  })}
                />
                {form.formState.errors.letzte_anlieferung && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.letzte_anlieferung.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location Distribution */}
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <MapPin className="h-5 w-5" />
              Standortverteilung
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {locationOptions.map((location) => (
                <div key={location.value} className="space-y-2">
                  <Label htmlFor={`location-${location.value}`}>
                    {location.label}
                  </Label>
                  <Input
                    id={`location-${location.value}`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={form.watch(`standort_verteilung.${location.value}`) || ""}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      updateLocationQuantity(location.value, value);
                    }}
                  />
                </div>
              ))}
            </div>
            
            <Separator />
            
            <div className="flex justify-between items-center text-sm">
              <span>Verteilte Gesamtmenge:</span>
              <span className={isOverDistributed ? "text-destructive font-medium" : ""}>
                {formatNumberWithThousandSeparator(distributedTotal)} / {formatNumberWithThousandSeparator(totalQuantity)}
              </span>
            </div>
            
            {isOverDistributed && (
              <p className="text-sm text-destructive">
                ⚠️ Die verteilte Menge ({formatNumberWithThousandSeparator(distributedTotal)}) 
                übersteigt die Gesamtmenge ({formatNumberWithThousandSeparator(totalQuantity)})
              </p>
            )}
            
            {form.formState.errors.standort_verteilung && (
              <p className="text-sm text-destructive">
                Standortverteilung ist fehlerhaft
              </p>
            )}
          </CardContent>
        </Card>

        {/* File Attachment */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-purple-600">
              <Upload className="h-5 w-5" />
              Datei-Anhang (optional)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="attachment" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Datei anhängen
              </Label>
              <Input
                id="attachment"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  form.setValue("attachment", file);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Erlaubte Dateiformate: PDF, Word, Excel, Bilder (max. 5MB)
              </p>
              {form.formState.errors.attachment && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.attachment.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upload Progress */}
        {isSubmitting && uploadProgress > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Projekt wird erstellt...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1"
          >
            Abbrechen
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || isOverDistributed}
            className="flex-1"
          >
            {isSubmitting ? "Erstelle Projekt..." : "Projekt erstellen"}
          </Button>
        </div>
      </form>
    </div>
  );
};