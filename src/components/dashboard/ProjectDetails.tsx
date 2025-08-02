import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, User, Calendar, Package, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Project {
  id: string;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  gesamtmenge: number;
  status: "draft" | "pending" | "approved" | "rejected" | "in_progress" | "completed";
  created_at: string;
  created_by: string;
  standort_verteilung?: Record<string, number>;
  menge_fix?: boolean;
}

interface User {
  id: string;
  email: string;
  role: "vertrieb" | "supply_chain" | "planung";
  full_name?: string;
}

interface ProjectDetailsProps {
  project: Project;
  user: User;
  onBack: () => void;
  onProjectAction: (projectId: string, action: string) => void;
}

const statusColors = {
  draft: "bg-gray-500",
  pending: "bg-warning",
  approved: "bg-success",
  rejected: "bg-destructive",
  in_progress: "bg-info",
  completed: "bg-primary"
};

const statusLabels = {
  draft: "Entwurf",
  pending: "Ausstehend",
  approved: "Genehmigt", 
  rejected: "Abgelehnt",
  in_progress: "In Bearbeitung",
  completed: "Abgeschlossen"
};

const locationLabels = {
  gudensberg: "Gudensberg",
  brenz: "Brenz",
  storkow: "Storkow",
  visbek: "Visbek",
  doebeln: "Döbeln"
};

export const ProjectDetails = ({ project, user, onBack, onProjectAction }: ProjectDetailsProps) => {
  const { toast } = useToast();
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [correctionData, setCorrectionData] = useState({
    newQuantity: project.gesamtmenge,
    description: "",
    locationDistribution: project.standort_verteilung || {}
  });

  const handleAction = async (action: string) => {
    try {
      let newStatus = project.status;
      let actionLabel = "";
      
      // Workflow-Logik basierend auf Rolle und Aktion
      if (user.role === "supply_chain") {
        if (action === "approve") {
          newStatus = "in_progress"; // Geht an Planung
          actionLabel = "genehmigt und an Planung weitergeleitet";
        } else if (action === "reject") {
          newStatus = "rejected";
          actionLabel = "abgelehnt";
        } else if (action === "correct") {
          newStatus = "draft"; // Zurück an Vertrieb
          actionLabel = "zur Korrektur an Vertrieb zurückgewiesen";
        }
      } else if (user.role === "planung") {
        if (action === "approve") {
          newStatus = "approved"; // Final freigegeben
          actionLabel = "final freigegeben";
        } else if (action === "reject") {
          newStatus = "pending"; // Zurück an SupplyChain
          actionLabel = "abgelehnt und an SupplyChain zurückgewiesen";
        } else if (action === "correct") {
          newStatus = "pending"; // Zurück an SupplyChain
          actionLabel = "zur Korrektur an SupplyChain zurückgewiesen";
        }
      }
      
      if (newStatus && newStatus !== project.status) {
        const { error } = await supabase
          .from('manufacturing_projects')
          .update({ status: newStatus })
          .eq('id', project.id);

        if (error) throw error;

        onProjectAction(project.id, action);

        toast({
          title: "Projekt aktualisiert",
          description: `Das Projekt wurde ${actionLabel}.`,
        });

        // Nach Aktion zurück zum Dashboard
        setTimeout(() => {
          onBack();
        }, 1500);
      }
    } catch (error) {
      console.error('Error updating project:', error);
      toast({
        title: "Fehler",
        description: "Projektstatus konnte nicht aktualisiert werden",
        variant: "destructive"
      });
    }
  };

  const handleCorrection = async () => {
    try {
      const { error } = await supabase
        .from('manufacturing_projects')
        .update({
          gesamtmenge: correctionData.newQuantity,
          standort_verteilung: correctionData.locationDistribution,
          status: user.role === "supply_chain" ? "draft" : "pending" // Back to previous stage
        })
        .eq('id', project.id);

      if (error) throw error;

      onProjectAction(project.id, "correct");
      
      toast({
        title: "Korrektur gesendet",
        description: `Das Projekt wurde zur Korrektur zurückgewiesen. Neue Menge: ${correctionData.newQuantity}`,
      });
      
      setShowCorrectionDialog(false);
      setCorrectionData({ 
        newQuantity: project.gesamtmenge, 
        description: "",
        locationDistribution: project.standort_verteilung || {}
      });

      // Nach Aktion zurück zum Dashboard
      setTimeout(() => {
        onBack();
      }, 1500);
    } catch (error) {
      console.error('Error correcting project:', error);
      toast({
        title: "Fehler",
        description: "Korrektur konnte nicht gespeichert werden",
        variant: "destructive"
      });
    }
  };

  const getActionButtons = () => {
    switch (user.role) {
      case "supply_chain":
        if (project.status === "pending") {
          return (
            <div className="flex gap-3">
              <Button onClick={() => handleAction("approve")} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                Zusage erteilen
              </Button>
              <Button variant="outline" onClick={() => setShowCorrectionDialog(true)} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white border-orange-500">
                Korrektur anfordern
              </Button>
              <Button onClick={() => handleAction("reject")} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                Absage erteilen
              </Button>
            </div>
          );
        }
        break;
      case "planung":
        if (project.status === "in_progress") {
          return (
            <div className="flex gap-3">
              <Button onClick={() => handleAction("approve")} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                Bestätigen
              </Button>
              <Button variant="outline" onClick={() => setShowCorrectionDialog(true)} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white border-orange-500">
                Korrektur
              </Button>
            </div>
          );
        }
        break;
      default:
        return null;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-primary">Projektdetails</h1>
              <p className="text-muted-foreground">Prüfung und Bearbeitung</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-6 max-w-4xl">
        <div className="space-y-6">
          {/* Projekt Übersicht */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Building2 className="h-5 w-5" />
                    {project.customer}
                    <Badge className={statusColors[project.status]}>
                      {statusLabels[project.status]}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-base mt-1">
                    {project.artikel_nummer} - {project.artikel_bezeichnung}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Gesamtmenge</p>
                    <p className="font-semibold">{project.gesamtmenge.toLocaleString()} Stück</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Erstellt am</p>
                    <p className="font-semibold">{new Date(project.created_at).toLocaleDateString("de-DE")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Erstellt von</p>
                    <p className="font-semibold">{project.created_by}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Artikeldetails */}
          <Card>
            <CardHeader>
              <CardTitle>Artikeldetails</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Artikelnummer</label>
                  <p className="text-lg font-mono">{project.artikel_nummer}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Menge fix</label>
                  <p className="text-lg">{project.menge_fix ? "Ja" : "Nein"}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Artikelbezeichnung</label>
                  <p className="text-lg">{project.artikel_bezeichnung}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Standortverteilung */}
          {project.standort_verteilung && (
            <Card>
              <CardHeader>
                <CardTitle>Standortverteilung</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {Object.entries(project.standort_verteilung).map(([location, quantity]) => (
                    <div key={location} className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm font-medium text-muted-foreground">
                        {locationLabels[location as keyof typeof locationLabels] || location}
                      </p>
                      <p className="text-2xl font-bold text-primary">{quantity.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Gesamt verteilt:</span>
                    <span className="font-semibold">
                      {Object.values(project.standort_verteilung).reduce((sum, val) => sum + val, 0).toLocaleString()} / {project.gesamtmenge.toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Aktionen */}
          {getActionButtons() && (
            <Card>
              <CardHeader>
                <CardTitle>Prüfung und Entscheidung</CardTitle>
                <CardDescription>
                  Wählen Sie eine Aktion für dieses Projekt
                </CardDescription>
              </CardHeader>
              <CardContent>
                {getActionButtons()}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Korrektur Dialog */}
      <Dialog open={showCorrectionDialog} onOpenChange={setShowCorrectionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Korrektur anfordern</DialogTitle>
            <DialogDescription>
              Passen Sie die Menge an und fügen Sie eine Beschreibung für die gewünschten Änderungen hinzu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Gesamtmenge - nur für Supply Chain */}
            {user.role === "supply_chain" && (
              <div className="space-y-2">
                <Label htmlFor="newQuantity">Neue Gesamtmenge</Label>
                <Input
                  id="newQuantity"
                  type="number"
                  value={correctionData.newQuantity}
                  onChange={(e) => setCorrectionData(prev => ({ 
                    ...prev, 
                    newQuantity: parseInt(e.target.value) || 0 
                  }))}
                  placeholder="Neue Menge eingeben"
                  min={1}
                />
              </div>
            )}

            {/* Standortverteilung */}
            {project.standort_verteilung && (
              <div className="space-y-4">
                <div>
                  <Label>Standortverteilung anpassen</Label>
                  <p className="text-sm text-muted-foreground">
                    Passen Sie die Mengen pro Standort an
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {Object.entries(project.standort_verteilung).map(([location, originalQuantity]) => (
                    <div key={location} className="flex items-center gap-3">
                      <div className="flex-1">
                        <Label className="text-sm">
                          {locationLabels[location as keyof typeof locationLabels] || location}
                        </Label>
                      </div>
                      <div className="w-24">
                        <Input
                          type="number"
                          value={correctionData.locationDistribution[location] || 0}
                          onChange={(e) => setCorrectionData(prev => ({
                            ...prev,
                            locationDistribution: {
                              ...prev.locationDistribution,
                              [location]: parseInt(e.target.value) || 0
                            }
                          }))}
                          min={0}
                          className="text-center"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                  <div className="flex justify-between items-center text-sm">
                    <span>Gesamt verteilt:</span>
                    <span className="font-semibold">
                      {Object.values(correctionData.locationDistribution).reduce((sum, val) => sum + val, 0).toLocaleString()}
                      {user.role === "supply_chain" && ` / ${correctionData.newQuantity.toLocaleString()}`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung der Änderungen</Label>
              <Textarea
                id="description"
                value={correctionData.description}
                onChange={(e) => setCorrectionData(prev => ({ 
                  ...prev, 
                  description: e.target.value 
                }))}
                placeholder="Beschreiben Sie die gewünschten Änderungen..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCorrectionDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCorrection}>
              Korrektur senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};