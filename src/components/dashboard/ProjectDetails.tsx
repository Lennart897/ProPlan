import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, User, Calendar, Package, Building2, Truck, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ProjectHistory } from "./ProjectHistory";

interface Project {
  id: string;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  produktgruppe?: string;
  gesamtmenge: number;
  beschreibung?: string;
  erste_anlieferung?: string;
  letzte_anlieferung?: string;
  status: "draft" | "pending" | "approved" | "rejected" | "in_progress" | "completed" | "archived";
  created_at: string;
  created_by: string;
  standort_verteilung?: Record<string, number>;
  menge_fix?: boolean;
}

interface User {
  id: string;
  email: string;
  role: "vertrieb" | "supply_chain" | "planung" | "planung_storkow" | "planung_brenz" | "planung_gudensberg" | "planung_doebeln" | "planung_visbek" | "admin";
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
  in_progress: "bg-warning",
  completed: "bg-primary",
  archived: "bg-muted"
};

const statusLabels = {
  draft: "Entwurf",
  pending: "Ausstehend",
  approved: "Genehmigt", 
  rejected: "Abgelehnt",
  in_progress: "In Bearbeitung",
  completed: "Abgeschlossen",
  archived: "Archiviert"
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
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [correctionData, setCorrectionData] = useState({
    newQuantity: project.gesamtmenge,
    description: "",
    locationDistribution: project.standort_verteilung || {}
  });

  const logProjectAction = async (action: string, previousStatus: string, newStatus: string, reason?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .single();

      const displayName =
        profile?.display_name ||
        (user.user_metadata?.display_name as string | undefined) ||
        (user.user_metadata?.full_name as string | undefined) ||
        user.email ||
        'Unbekannt';

      await supabase
        .from('project_history')
        .insert({
          project_id: project.id,
          user_id: user.id,
          user_name: displayName,
          action,
          reason,
          previous_status: previousStatus,
          new_status: newStatus
        });
    } catch (error) {
      console.error('Error logging project action:', error);
    }
  };

  const handleAction = async (action: string) => {
    try {
      const previousStatus = project.status;

      // Supply Chain: Zusage -> Status in_progress (Standort-Zusagen werden per Trigger erstellt)
      if (user.role === "supply_chain" && action === "approve") {
        const { error } = await supabase
          .from('manufacturing_projects')
          .update({ status: "in_progress" })
          .eq('id', project.id);
        if (error) throw error;

        await logProjectAction('approved_forwarded', previousStatus, 'in_progress');

        onProjectAction(project.id, action);
        toast({
          title: "Zusage erteilt",
          description: "Projekt wurde an die standortspezifische Planung weitergeleitet.",
        });

        setTimeout(() => onBack(), 1500);
        return;
      }

      // Planung: standortspezifische Zusage -> nur Standort-Zusage setzen, Status bleibt bis alle zu sind
      if ((user.role === "planung" || user.role.startsWith("planung_")) && action === "approve") {
        const userLocation = user.role.startsWith("planung_") ? user.role.replace("planung_", "") : null;

        let query = supabase
          .from('project_location_approvals')
          .update({
            approved: true,
            approved_by: user.id,
            approved_at: new Date().toISOString(),
          })
          .eq('project_id', project.id);

        if (userLocation) {
          query = query.eq('location', userLocation);
        }

        const { error } = await query;
        if (error) throw error;

        await logProjectAction('location_approved', previousStatus, previousStatus);

        onProjectAction(project.id, action);
        toast({
          title: "Standort-Zusage erteilt",
          description: "Projekt bleibt in Bearbeitung, bis alle betroffenen Standorte zugesagt haben.",
        });

        setTimeout(() => onBack(), 1500);
        return;
      }

      // Ablehnung / Korrektur / Archivierung wie bisher
      let newStatus = project.status;
      let actionLabel = "";

      if (user.role === "supply_chain") {
        if (action === "reject") {
          newStatus = "rejected";
          actionLabel = "abgelehnt";
        } else if (action === "correct") {
          newStatus = "draft";
          actionLabel = "zur Korrektur an Vertrieb zurückgewiesen";
        }
      } else if (user.role === "planung" || user.role.startsWith("planung_")) {
        if (action === "reject") {
          newStatus = "pending";
          actionLabel = "abgelehnt und an SupplyChain zurückgewiesen";
        } else if (action === "correct") {
          newStatus = "pending";
          actionLabel = "zur Korrektur an SupplyChain zurückgewiesen";
        }
      } else if (user.role === "vertrieb") {
        if (action === "archive" && project.status === "approved") {
          newStatus = "archived";
          actionLabel = "archiviert";
        }
      }

      if (newStatus && newStatus !== project.status) {
        const { error } = await supabase
          .from('manufacturing_projects')
          .update({ status: newStatus })
          .eq('id', project.id);
        if (error) throw error;

        await logProjectAction(action, previousStatus, newStatus);

        onProjectAction(project.id, action);
        toast({
          title: "Projekt aktualisiert",
          description: `Das Projekt wurde ${actionLabel}.`,
        });

        setTimeout(() => onBack(), 1500);
      }
    } catch (error) {
      console.error('Error updating project:', error);
      toast({
        title: "Fehler",
        description: "Aktion konnte nicht durchgeführt werden",
        variant: "destructive"
      });
    }
  };

  const handleCorrection = async () => {
    try {
      const previousStatus = project.status;
      
      // Determine next status based on Supply Chain correction logic
      let newStatus = "pending";
      if (user.role === "supply_chain") {
        // Check if Gesamtmenge was changed
        const quantityChanged = correctionData.newQuantity !== project.gesamtmenge;
        
        if (quantityChanged) {
          // Gesamtmenge changed -> back to Vertrieb
          newStatus = "draft";
        } else {
          // Only location distribution changed -> to location-specific planning
          newStatus = "pending";
        }
      } else {
        // Other roles (planning) -> back to pending
        newStatus = "pending";
      }
      
      const { error } = await supabase
        .from('manufacturing_projects')
        .update({
          gesamtmenge: correctionData.newQuantity,
          standort_verteilung: correctionData.locationDistribution,
          status: newStatus
        })
        .eq('id', project.id);

      if (error) throw error;

      // Log the correction action with specific description
      const actionDescription = user.role === "supply_chain" && correctionData.newQuantity !== project.gesamtmenge
        ? `${correctionData.description} (Gesamtmenge geändert: ${project.gesamtmenge} → ${correctionData.newQuantity} kg)`
        : correctionData.description;
      
      await logProjectAction('corrected', previousStatus, newStatus, actionDescription);

      onProjectAction(project.id, "correct");
      
      const nextStep = user.role === "supply_chain" && correctionData.newQuantity !== project.gesamtmenge
        ? "Vertrieb" 
        : "standortspezifische Planung";
      
      toast({
        title: "Korrektur gesendet",
        description: `Das Projekt wurde zur Korrektur an ${nextStep} weitergeleitet.`,
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
              <Button onClick={() => setShowRejectionDialog(true)} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                Absage erteilen
              </Button>
            </div>
          );
        }
        break;
      case "planung":
      case "planung_storkow":
      case "planung_brenz":
      case "planung_gudensberg":
      case "planung_doebeln":
      case "planung_visbek":
        if (project.status === "in_progress") {
          // For location-specific planning roles, check if they can approve this project
          const userLocation = user.role.startsWith("planung_") ? user.role.replace("planung_", "") : null;
          const affectedLocations = project.standort_verteilung ? 
            Object.keys(project.standort_verteilung).filter(location => 
              project.standort_verteilung![location] > 0
            ) : [];
          
          // Legacy "planung" role can approve any project, location-specific roles only their relevant ones
          const canApprove = user.role === "planung" || 
            (userLocation && affectedLocations.includes(userLocation));
          
          if (!canApprove && userLocation) {
            return (
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Dieses Projekt betrifft nicht Ihren Standort ({userLocation}). 
                  Es muss von {affectedLocations.map(loc => `Planung ${loc.charAt(0).toUpperCase() + loc.slice(1)}`).join(", ")} geprüft werden.
                </p>
              </div>
            );
          }
          
          return (
            <div className="flex gap-3">
              <Button onClick={() => handleAction("approve")} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                Zusage erteilen
              </Button>
              <Button variant="outline" onClick={() => setShowCorrectionDialog(true)} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white border-orange-500">
                Korrektur anfordern
              </Button>
              {/* Only legacy "planung" role can reject, location-specific roles cannot */}
              {user.role === "planung" && (
                <Button variant="outline" onClick={() => handleAction("reject")} className="flex-1 border-red-500 text-red-600 hover:bg-red-50">
                  Ablehnen
                </Button>
              )}
            </div>
          );
        }
        return null;
      case "vertrieb":
        // Vertrieb: jederzeit ablehnen (außer bereits abgelehnt, archiviert oder abgeschlossen)
        const canSalesReject = !["rejected", "archived", "completed"].includes(project.status);
        if (canSalesReject || project.status === "approved") {
          return (
            <div className="flex gap-3">
              {canSalesReject && (
                <Button variant="destructive" onClick={() => setShowRejectionDialog(true)} className="flex-1">
                  Absage erteilen
                </Button>
              )}
              {project.status === "approved" && (
                <Button 
                  onClick={() => handleAction("archive")} 
                  className="flex-1 bg-muted hover:bg-muted-foreground/20 text-muted-foreground border border-muted-foreground/30"
                >
                  Projekt archivieren
                </Button>
              )}
            </div>
          );
        }
        return null;
      default:
        return null;
    }
    return null;
  };

  const handleRejection = async () => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Begründung erforderlich",
        description: "Bitte geben Sie eine Begründung für die Ablehnung ein.",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('manufacturing_projects')
        .update({ 
          status: "rejected",
          rejection_reason: rejectionReason
        })
        .eq('id', project.id);

      if (error) throw error;

      // Log the rejection action
      await logProjectAction('rejected', project.status, 'rejected', rejectionReason);

      onProjectAction(project.id, "reject");
      
      toast({
        title: "Projekt abgelehnt",
        description: `Das Projekt wurde abgelehnt. Begründung: ${rejectionReason}`,
      });
      
      setShowRejectionDialog(false);
      setRejectionReason("");

      // Nach Aktion zurück zum Dashboard
      setTimeout(() => {
        onBack();
      }, 1500);
    } catch (error) {
      console.error('Error rejecting project:', error);
      toast({
        title: "Fehler",
        description: "Projekt konnte nicht abgelehnt werden",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
                Zurück
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-sm font-bold text-primary-foreground">PP</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-primary">ProPlan</h1>
                  <p className="text-muted-foreground">Projektdetails - Prüfung und Bearbeitung</p>
                </div>
              </div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Gesamtmenge (kg)</p>
                    <p className="font-semibold">{project.gesamtmenge.toLocaleString('de-DE')} kg</p>
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
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Menge fix</p>
                    <p className="font-semibold">{project.menge_fix ? "Ja" : "Nein"}</p>
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
                {project.produktgruppe && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Produktgruppe</label>
                    <p className="text-lg">{project.produktgruppe}</p>
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Artikelbezeichnung</label>
                  <p className="text-lg">{project.artikel_bezeichnung}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Beschreibung */}
          {project.beschreibung && (
            <Card>
              <CardHeader>
                <CardTitle>Projektbeschreibung</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{project.beschreibung}</p>
              </CardContent>
            </Card>
          )}

          {/* Anlieferungsdetails */}
          {(project.erste_anlieferung || project.letzte_anlieferung) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Anlieferungszeitraum
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {project.erste_anlieferung && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Erste Anlieferung</label>
                      <p className="text-lg">{project.erste_anlieferung.split('-').reverse().join('.')}</p>
                    </div>
                  )}
                  {project.letzte_anlieferung && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Letzte Anlieferung</label>
                      <p className="text-lg">{project.letzte_anlieferung.split('-').reverse().join('.')}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

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
                      <p className="text-2xl font-bold text-primary">{quantity.toLocaleString('de-DE')} kg</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Gesamt verteilt:</span>
                    <span className="font-semibold">
                      {Object.values(project.standort_verteilung).reduce((sum, val) => sum + val, 0).toLocaleString('de-DE')} kg / {project.gesamtmenge.toLocaleString('de-DE')} kg
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
                <div className="space-y-4">
                  {/* Wochenkalender Vorschau Button - nur für Planung und Supply Chain */}
                  {(user.role === 'planung' || user.role.startsWith('planung_') || user.role === 'supply_chain') && (
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Mengenplanung Vorschau</h4>
                          <p className="text-sm text-muted-foreground">
                            Sehen Sie, wie sich dieses Projekt auf die Wochenplanung auswirken würde
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => {
                            console.log('Wochenkalender Vorschau clicked for project:', project.id);
                            onProjectAction(project.id, 'preview_calendar');
                          }}
                        >
                          <Calendar className="w-4 h-4 mr-2" />
                          Wochenkalender Vorschau
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {getActionButtons()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Projektprotokoll */}
          <ProjectHistory projectId={project.id} />
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
                <Label htmlFor="newQuantity">Neue Gesamtmenge (kg)</Label>
                <Input
                  id="newQuantity"
                  type="number"
                  step="0.1"
                  value={correctionData.newQuantity}
                  onChange={(e) => setCorrectionData(prev => ({ 
                    ...prev, 
                    newQuantity: parseFloat(e.target.value) || 0 
                  }))}
                  placeholder="Neue Menge eingeben"
                  min={0.1}
                />
              </div>
            )}

            {/* Standortverteilung */}
            {project.standort_verteilung && (
              <div className="space-y-4">
                <div>
                  <Label>Standortverteilung anpassen</Label>
                  <p className="text-sm text-muted-foreground">
                    {user.role === "supply_chain" ? 
                      "Passen Sie die Mengen pro Standort an" : 
                      `Passen Sie die Menge für ${user.role.replace("planung_", "").charAt(0).toUpperCase() + user.role.replace("planung_", "").slice(1)} an`
                    }
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {Object.entries(project.standort_verteilung)
                    .filter(([location, originalQuantity]) => {
                      // Supply Chain can edit all locations, location-specific roles can only edit their location
                      if (user.role === "supply_chain" || user.role === "planung") {
                        return true;
                      }
                      // Location-specific planning roles can only edit their specific location
                      const userLocation = user.role.replace("planung_", "");
                      return location === userLocation;
                    })
                    .map(([location, originalQuantity]) => (
                    <div key={location} className="flex items-center gap-3">
                      <div className="flex-1">
                        <Label className="text-sm">
                          {locationLabels[location as keyof typeof locationLabels] || location} (kg)
                        </Label>
                      </div>
                      <div className="w-24">
                        <Input
                          type="number"
                          step="0.1"
                          value={correctionData.locationDistribution[location] || 0}
                          onChange={(e) => setCorrectionData(prev => ({
                            ...prev,
                            locationDistribution: {
                              ...prev.locationDistribution,
                              [location]: parseFloat(e.target.value) || 0
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
                      {Object.values(correctionData.locationDistribution).reduce((sum, val) => sum + val, 0).toFixed(1)} kg
                      {user.role === "supply_chain" && ` / ${correctionData.newQuantity.toFixed(1)} kg`}
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

      {/* Ablehnungs-Dialog */}
      <Dialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Projekt ablehnen</DialogTitle>
            <DialogDescription>
              Bitte geben Sie eine Begründung für die Ablehnung des Projekts ein.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejection-reason">Begründung für die Ablehnung</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Begründung eingeben..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectionDialog(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleRejection}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Projekt ablehnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};