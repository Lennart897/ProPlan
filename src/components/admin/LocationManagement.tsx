import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Pencil, Plus, Eye, EyeOff } from "lucide-react";

const locationSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(100, "Name zu lang"),
  code: z.string().min(1, "Code ist erforderlich").max(50, "Code zu lang").regex(/^[a-z0-9_-]+$/, "Code darf nur Kleinbuchstaben, Zahlen, Unterstriche und Bindestriche enthalten"),
});

type LocationFormData = z.infer<typeof locationSchema>;

interface Location {
  id: string;
  name: string;
  code: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function LocationManagement() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
  });

  const loadLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error loading locations:', error);
        toast({
          title: "Fehler",
          description: "Standorte konnten nicht geladen werden.",
          variant: "destructive",
        });
        return;
      }

      setLocations(data || []);
    } catch (error) {
      console.error('Error loading locations:', error);
      toast({
        title: "Fehler",
        description: "Unerwarteter Fehler beim Laden der Standorte.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: LocationFormData) => {
    try {
      if (editingLocation) {
        // Update existing location
        const { error } = await supabase
          .from('locations')
          .update({
            name: data.name,
            code: data.code,
          })
          .eq('id', editingLocation.id);

        if (error) {
          if (error.code === '23505') { // Unique constraint violation
            toast({
              title: "Fehler",
              description: "Name oder Code bereits vorhanden.",
              variant: "destructive",
            });
            return;
          }
          throw error;
        }

        toast({
          title: "Erfolg",
          description: "Standort erfolgreich aktualisiert.",
        });
      } else {
        // Create new location
        const { error } = await supabase
          .from('locations')
          .insert({
            name: data.name,
            code: data.code,
          });

        if (error) {
          if (error.code === '23505') { // Unique constraint violation
            toast({
              title: "Fehler",
              description: "Name oder Code bereits vorhanden.",
              variant: "destructive",
            });
            return;
          }
          throw error;
        }

        toast({
          title: "Erfolg",
          description: "Standort erfolgreich erstellt.",
        });
      }

      handleCloseDialog();
      loadLocations();
    } catch (error) {
      console.error('Error saving location:', error);
      toast({
        title: "Fehler",
        description: "Standort konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  };

  const toggleLocationStatus = async (location: Location) => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ active: !location.active })
        .eq('id', location.id);

      if (error) throw error;

      toast({
        title: "Erfolg",
        description: `Standort ${location.active ? 'deaktiviert' : 'aktiviert'}.`,
      });

      loadLocations();
    } catch (error) {
      console.error('Error toggling location status:', error);
      toast({
        title: "Fehler",
        description: "Status konnte nicht geändert werden.",
        variant: "destructive",
      });
    }
  };

  const handleOpenDialog = (location?: Location) => {
    setEditingLocation(location || null);
    if (location) {
      setValue('name', location.name);
      setValue('code', location.code);
    } else {
      reset();
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingLocation(null);
    reset();
  };

  useEffect(() => {
    loadLocations();
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Standortverwaltung</CardTitle>
          <CardDescription>Lade Standorte...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Standortverwaltung</CardTitle>
            <CardDescription>
              Verwalten Sie alle Standorte zentral. Standorte werden dynamisch in der gesamten Anwendung verwendet.
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Standort hinzufügen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit(onSubmit)}>
                <DialogHeader>
                  <DialogTitle>
                    {editingLocation ? 'Standort bearbeiten' : 'Neuen Standort hinzufügen'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingLocation 
                      ? 'Bearbeiten Sie die Standortdaten.'
                      : 'Erstellen Sie einen neuen Standort. Name und Code müssen eindeutig sein.'
                    }
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Standortname</Label>
                    <Input
                      id="name"
                      placeholder="z.B. Gudensberg"
                      {...register('name')}
                    />
                    {errors.name && (
                      <p className="text-sm text-destructive">{errors.name.message}</p>
                    )}
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="code">Code (technische Referenz)</Label>
                    <Input
                      id="code"
                      placeholder="z.B. gudensberg"
                      {...register('code')}
                    />
                    {errors.code && (
                      <p className="text-sm text-destructive">{errors.code.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Nur Kleinbuchstaben, Zahlen, Unterstriche und Bindestriche erlaubt
                    </p>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting 
                      ? (editingLocation ? 'Aktualisiere...' : 'Erstelle...') 
                      : (editingLocation ? 'Aktualisieren' : 'Erstellen')
                    }
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erstellt</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Keine Standorte gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                locations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="font-medium">{location.name}</TableCell>
                    <TableCell className="font-mono">{location.code}</TableCell>
                    <TableCell>
                      <Badge variant={location.active ? "default" : "secondary"}>
                        {location.active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(location.created_at).toLocaleDateString('de-DE')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(location)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleLocationStatus(location)}
                        >
                          {location.active ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}