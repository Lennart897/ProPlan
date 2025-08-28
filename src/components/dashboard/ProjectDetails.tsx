import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, User, Calendar, Package, Building2, Truck, Clock, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ProjectHistory } from "./ProjectHistory";
import { getStatusLabel, getStatusColor, canArchiveProject, PROJECT_STATUS } from "@/utils/statusUtils";
import { useLocations } from "@/hooks/useLocations";

interface Project {
  id: string;
  project_number?: number;
  customer: string;
  artikel_nummer: string;
  artikel_bezeichnung: string;
  produktgruppe?: string;
  gesamtmenge: number;
  beschreibung?: string;
  erste_anlieferung?: string;
  letzte_anlieferung?: string;
  status: number;
  created_at: string;
  created_by: string;
  created_by_id?: string;
  created_by_name?: string;
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
  onProjectAction: (project: Project, action: string, data?: any) => void;
  onShowPreview?: (project: any) => void;
}

// Location labels now loaded dynamically via useLocations hook

export const ProjectDetails = ({ project, user, onBack, onProjectAction, onShowPreview }: ProjectDetailsProps) => {
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [correctedQuantity, setCorrectedQuantity] = useState(project.gesamtmenge.toString());
  const [locationQuantities, setLocationQuantities] = useState<Record<string, number>>(
    project.standort_verteilung || {}
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const { toast } = useToast();
  const { getLocationName } = useLocations(true, false);

  const logProjectAction = async (action: string, oldData?: any, newData?: any) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();

      const displayName = profile?.display_name || user.full_name || user.email;

       await supabase
         .from('project_history')
         .insert({
           project_id: project.id,
           user_id: user.id,
           user_name: displayName,
           action: action,
           previous_status: oldData?.status ? getStatusLabel(oldData.status) : null,
           new_status: newData?.status ? getStatusLabel(newData.status) : null,
           reason: newData?.rejection_reason || newData?.correction_reason || null
         });
    } catch (error) {
      console.error('Fehler beim Protokollieren der Aktion:', error);
    }
  };

  const handleAction = async (action: string) => {
    try {
      console.log('Starting action:', action, 'for project:', project.id);
      
      let updateData: any = {};
      let actionType = '';

      switch (action) {
        case 'approve':
          // For planning users, update location approval instead of project status
          if (user.role?.startsWith('planung_') || user.role === 'planung') {
            // Get user's location from role
            const userLocation = user.role === 'planung' ? null : user.role.replace('planung_', '');
            
            if (userLocation) {
              // Update the specific location approval
              const { error: approvalError } = await supabase
                .from('project_location_approvals')
                .update({ 
                  approved: true, 
                  approved_at: new Date().toISOString(),
                  approved_by: user.id 
                })
                .eq('project_id', project.id)
                .eq('location', userLocation);

              if (approvalError) {
                throw approvalError;
              }

              actionType = 'Standort-Genehmigung';
              // Don't update project status directly - triggers will handle it
              updateData = null;
            } else {
              // Legacy planung role - approve project directly
              updateData = { status: PROJECT_STATUS.GENEHMIGT };
              actionType = 'Genehmigung';
            }
          } else {
            updateData = { status: PROJECT_STATUS.GENEHMIGT };
            actionType = 'Genehmigung';
          }
          break;
        case 'reject':
          updateData = { status: PROJECT_STATUS.ABGELEHNT, rejection_reason: rejectionReason };
          actionType = 'Ablehnung';
          
          // Check if this is a creator rejection (approved project being rejected by creator)
          const isCreatorRejection = project.status === PROJECT_STATUS.GENEHMIGT && 
                                   (project.created_by_id === user.id || project.created_by === user.id);
          
          if (isCreatorRejection) {
            // Creator rejection email notification is now handled by database trigger
            console.log('Creator rejection detected - email will be sent by database trigger');
            actionType = 'Projektstornierung durch Ersteller';
          } else {
            // Send normal rejection email notification
            try {
              await supabase.functions.invoke('send-project-rejection-email', {
                body: {
                  id: project.id,
                  project_number: project.project_number,
                  customer: project.customer,
                  artikel_nummer: project.artikel_nummer,
                  artikel_bezeichnung: project.artikel_bezeichnung,
                  created_by_id: project.created_by_id || project.created_by,
                  created_by_name: project.created_by_name,
                  rejection_reason: rejectionReason
                }
              });
              console.log('Rejection email sent successfully');
            } catch (emailError) {
              console.error('Error sending rejection email:', emailError);
              // Continue with the rejection even if email fails
            }
          }
          break;
        case 'archive':
          if (!canArchiveProject(project.status)) {
            throw new Error('Projekt kann nur archiviert werden wenn es genehmigt, abgelehnt oder abgeschlossen ist.');
          }
          updateData = { archived: true, archived_at: new Date().toISOString() };
          actionType = 'Archivierung';
          break;
        case 'send_to_progress':
          updateData = { status: PROJECT_STATUS.PRUEFUNG_PLANUNG };
          actionType = 'Weiterleitung zur Bearbeitung';
          break;
        case 'send_to_vertrieb':
          updateData = { status: PROJECT_STATUS.PRUEFUNG_VERTRIEB };
          actionType = 'Weiterleitung an Vertrieb';
          break;
        case 'cancel':
          updateData = { status: PROJECT_STATUS.ABGELEHNT, rejection_reason: 'Projekt vom Ersteller abgesagt' };
          actionType = 'Projektstornierung';
          break;
        default:
          throw new Error(`Unbekannte Aktion: ${action}`);
      }

      console.log('Update data:', updateData);
      console.log('User role:', user.role);
      console.log('Current project status:', project.status);

      // Log the action first
      try {
        await logProjectAction(action, { status: project.status }, updateData);
      } catch (logError) {
        console.error('Error logging project action:', logError);
        // Continue with update even if logging fails
      }

      // Update the project only if there's data to update
      if (updateData && Object.keys(updateData).length > 0) {
        console.log('Attempting to update project...');
        const { error } = await supabase
          .from('manufacturing_projects')
          .update(updateData)
          .eq('id', project.id);

        if (error) {
          console.error('Database update error:', error);
          throw error;
        }

        console.log('Project updated successfully');
      } else {
        console.log('No project update needed - location approval updated instead');
      }

      toast({
        title: "Erfolgreich",
        description: `${actionType} wurde durchgeführt.`,
      });

      // Close dialogs
      setShowRejectionDialog(false);
      setRejectionReason("");

      // Notify parent component
      onProjectAction(project, action);

      // Go back to list
      onBack();
    } catch (error) {
      console.error(`Fehler bei ${action}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      toast({
        title: "Fehler",
        description: `${action} konnte nicht durchgeführt werden: ${errorMessage}`,
        variant: "destructive",
      });
    }
  };

  const handleCorrection = async (updateData: any) => {
    try {
      // Validate correction reason
      if (!correctionReason.trim()) {
        toast({
          title: "Fehler",
          description: "Bitte geben Sie eine Begründung für die Korrektur an.",
          variant: "destructive",
        });
        return;
      }

      await logProjectAction('correction', { 
        status: project.status,
        gesamtmenge: project.gesamtmenge,
        standort_verteilung: project.standort_verteilung 
      }, { ...updateData, correction_reason: correctionReason });

      // If location-specific planning user is sending back to SupplyChain (status 3),
      // we need to use a transaction to delete location approvals and update project atomically
      if (user.role.startsWith('planung_') && updateData.status === PROJECT_STATUS.PRUEFUNG_SUPPLY_CHAIN) {
        // Execute both operations in a single RPC call to ensure atomicity
        const { error } = await supabase.rpc('handle_planning_correction', {
          p_project_id: project.id,
          p_gesamtmenge: updateData.gesamtmenge,
          p_standort_verteilung: updateData.standort_verteilung,
          p_status: updateData.status,
          p_rejection_reason: correctionReason
        });

        if (error) {
          console.error('Error handling planning correction:', error);
          throw error;
        }
      } else {
        // For other roles, just update the project normally
        const { error } = await supabase
          .from('manufacturing_projects')
          .update(updateData)
          .eq('id', project.id);

        if (error) throw error;
      }

      toast({
        title: "Erfolgreich",
        description: "Korrektur wurde durchgeführt.",
      });

      setShowCorrectionDialog(false);
      setCorrectionReason("");
      
      // Notify parent component
      onProjectAction(project, 'correct', updateData);
      
      // Go back to list
      onBack();
    } catch (error) {
      console.error('Fehler bei Korrektur:', error);
      toast({
        title: "Fehler",
        description: "Korrektur konnte nicht durchgeführt werden.",
        variant: "destructive",
      });
    }
  };

  const handleRejection = async () => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Ablehnungsgrund an.",
        variant: "destructive",
      });
      return;
    }
    await handleAction('reject');
  };

  const getActionButtons = () => {
    const buttons = [];

    // Vorschau-Button für Projekte in Prüfstatus (2, 3, 4)
    if ([2, 3, 4].includes(project.status) && onShowPreview && project.erste_anlieferung && project.letzte_anlieferung) {
      buttons.push(
        <Button key="preview" variant="outline" className="w-64" onClick={() => onShowPreview({
          id: project.id,
          customer: project.customer,
          artikel_nummer: project.artikel_nummer,
          artikel_bezeichnung: project.artikel_bezeichnung,
          produktgruppe: project.produktgruppe,
          gesamtmenge: project.gesamtmenge,
          beschreibung: project.beschreibung,
          erste_anlieferung: project.erste_anlieferung,
          letzte_anlieferung: project.letzte_anlieferung,
          status: project.status,
          created_at: project.created_at,
          created_by_name: project.created_by_name || project.created_by,
          standort_verteilung: project.standort_verteilung,
          menge_fix: project.menge_fix
        })}>
          <Calendar className="h-4 w-4 mr-2" />
          Vorschau im Kalender
        </Button>
      );
    }

    // Status-spezifische Aktionen basierend auf Benutzerrolle
    switch (user.role) {
      case 'supply_chain':
        if (project.status === PROJECT_STATUS.PRUEFUNG_SUPPLY_CHAIN) {
          buttons.push(
             <Button key="approve" className="bg-green-600 hover:bg-green-700 w-64" onClick={() => handleAction('send_to_progress')}>
              Zur Planung weiterleiten
            </Button>
          );
          buttons.push(
             <Button key="correct" className="bg-orange-600 hover:bg-orange-700 text-white w-64" onClick={() => setShowCorrectionDialog(true)}>
              Korrigieren
            </Button>
          );
          buttons.push(
             <Button key="reject" variant="destructive" size="default" className="w-64" onClick={() => setShowRejectionDialog(true)}>
              Projekt ablehnen
            </Button>
          );
        }
        break;

      case 'vertrieb':
        if (project.status === PROJECT_STATUS.PRUEFUNG_VERTRIEB) {
          buttons.push(
             <Button key="approve" className="bg-green-600 hover:bg-green-700 w-64" onClick={() => handleAction('send_to_progress')}>
              Zur Planung weiterleiten
            </Button>
          );
          buttons.push(
             <Button key="reject" variant="destructive" size="default" className="w-64" onClick={() => setShowRejectionDialog(true)}>
              Projekt ablehnen
            </Button>
          );
        }
        // Vertrieb kann genehmigte, abgelehnte und abgeschlossene Projekte archivieren
        if (canArchiveProject(project.status)) {
          buttons.push(
             <Button key="archive" variant="outline" className="w-64" onClick={() => handleAction('archive')}>
              Archivieren
            </Button>
          );
        }
        break;

      case 'planung':
      case 'planung_storkow':
      case 'planung_brenz':
      case 'planung_gudensberg':
      case 'planung_doebeln':
      case 'planung_visbek':
        if (project.status === PROJECT_STATUS.PRUEFUNG_PLANUNG) {
          buttons.push(
             <Button key="approve" className="bg-green-600 hover:bg-green-700 text-white w-64" onClick={() => handleAction('approve')}>
               Genehmigen
             </Button>
          );
          buttons.push(
            <Button key="correct" className="bg-orange-600 hover:bg-orange-700 text-white w-64" onClick={() => setShowCorrectionDialog(true)}>
              Korrigieren
            </Button>
          );
          // Nur allgemeine 'planung' Rolle darf ablehnen, nicht die standortspezifischen
          if (user.role === 'planung') {
            buttons.push(
              <Button key="reject" variant="destructive" size="default" className="w-64" onClick={() => setShowRejectionDialog(true)}>
                Projekt ablehnen
              </Button>
            );
          }
        }
        break;

      case 'admin':
        // Admin kann alle Aktionen durchführen
        if (project.status === PROJECT_STATUS.PRUEFUNG_SUPPLY_CHAIN) {
          buttons.push(
             <Button key="approve" className="bg-green-600 hover:bg-green-700 w-64" onClick={() => handleAction('send_to_progress')}>
              Zur Planung weiterleiten
            </Button>
          );
          buttons.push(
            <Button key="send_vertrieb" className="bg-orange-600 hover:bg-orange-700 text-white w-64" onClick={() => handleAction('send_to_vertrieb')}>
              An Vertrieb weiterleiten
            </Button>
          );
        }
        if (project.status === PROJECT_STATUS.PRUEFUNG_VERTRIEB) {
          buttons.push(
            <Button key="approve" className="bg-green-600 hover:bg-green-700 w-64" onClick={() => handleAction('send_to_progress')}>
              Zur Planung weiterleiten
            </Button>
          );
        }
        if (project.status === PROJECT_STATUS.PRUEFUNG_PLANUNG) {
          buttons.push(
            <Button key="approve" className="bg-green-600 hover:bg-green-700 text-white w-64" onClick={() => handleAction('approve')}>
               Genehmigen
             </Button>
          );
          buttons.push(
            <Button key="correct" variant="secondary" className="w-64" onClick={() => setShowCorrectionDialog(true)}>
              Korrigieren
            </Button>
          );
        }
        if (canArchiveProject(project.status)) {
          buttons.push(
            <Button key="archive" variant="outline" className="w-64" onClick={() => handleAction('archive')}>
              Archivieren
            </Button>
          );
        }
        break;
    }

    // Allow project creators to reject approved projects (status 5) - regardless of role
    if (project.status === PROJECT_STATUS.GENEHMIGT && (project.created_by_id === user.id || project.created_by === user.id)) {
      console.log('Creator rejection button should show:', {
        projectStatus: project.status,
        expectedStatus: PROJECT_STATUS.GENEHMIGT,
        projectCreatorId: project.created_by_id,
        projectCreatedBy: project.created_by,
        currentUserId: user.id,
        userRole: user.role,
        matches: project.created_by_id === user.id || project.created_by === user.id
      });
      buttons.push(
        <Button key="creator_reject" variant="destructive" className="w-64" onClick={() => {
          console.log('Creator rejection button clicked');
          setShowRejectionDialog(true);
        }}>
          Projekt absagen
        </Button>
      );
    }

    return buttons;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onBack} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück zur Übersicht
          </Button>
          <Badge className={getStatusColor(project.status)}>
            {getStatusLabel(project.status)}
          </Badge>
        </div>

        {/* Project Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Projektübersicht
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Projekt-Nummer</Label>
                  <p className="text-lg font-semibold text-primary">#{project.project_number}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Kunde</Label>
                  <p className="text-lg font-semibold">{project.customer}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Erstellt von</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{project.created_by_name || project.created_by || "Unbekannt"}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Erstellt am</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{new Date(project.created_at).toLocaleString("de-DE")}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Gesamtmenge</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{project.gesamtmenge.toLocaleString('de-DE')} kg</span>
                    {project.menge_fix && (
                      <Badge variant="outline" className="text-xs">Menge fix</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Article Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Artikeldetails
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Artikelbezeichnung</Label>
                <p className="text-lg">{project.artikel_bezeichnung}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Artikel-Nummer</Label>
                <p className="font-medium">{project.artikel_nummer}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Produktgruppe</Label>
                <p className="font-medium">{project.produktgruppe || "Nicht angegeben"}</p>
              </div>
              {project.beschreibung && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Beschreibung</Label>
                  <p className="whitespace-pre-wrap">{project.beschreibung}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Delivery Information */}
        {(project.erste_anlieferung || project.letzte_anlieferung) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Lieferinformationen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {project.erste_anlieferung && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Erste Anlieferung</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{new Date(project.erste_anlieferung).toLocaleDateString("de-DE")}</span>
                    </div>
                  </div>
                )}
                {project.letzte_anlieferung && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Letzte Anlieferung</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{new Date(project.letzte_anlieferung).toLocaleDateString("de-DE")}</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Location Distribution */}
        {project.standort_verteilung && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Standortverteilung
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(project.standort_verteilung)
                  .filter(([_, amount]) => amount > 0)
                  .map(([location, amount]) => (
                    <div key={location} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <span className="font-medium">
                        {getLocationName(location)}
                      </span>
                      <span className="font-semibold">{amount.toLocaleString('de-DE')} kg</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 items-center">
              <div className="flex flex-wrap gap-3 justify-center">
                {getActionButtons()}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project History */}
        <ProjectHistory projectId={project.id} />

        {/* Correction Dialog */}
        <Dialog open={showCorrectionDialog} onOpenChange={setShowCorrectionDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Projekt korrigieren</DialogTitle>
              <DialogDescription>
                Korrigieren Sie die Mengenangaben und Standortverteilung.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                
                // SupplyChain Korrektur-Logik:
                // - Wenn Gesamtmenge geändert wurde → Status 2 (Vertrieb prüft)
                // - Wenn nur Standortverteilung geändert wurde → Status 4 (Planung prüft)
                 const originalQuantity = project.gesamtmenge;
                 const newQuantity = parseInt(correctedQuantity);
                 const quantityChanged = originalQuantity !== newQuantity;
                 
                 let newStatus = project.status; // Default: Status bleibt gleich
                 
                 if (user.role === 'supply_chain') {
                   if (quantityChanged) {
                     newStatus = PROJECT_STATUS.PRUEFUNG_VERTRIEB; // Status 2
                   } else {
                     newStatus = PROJECT_STATUS.PRUEFUNG_PLANUNG; // Status 4
                   }
                 } else if (user.role.startsWith('planung_')) {
                   // Standortspezifische Planungsrollen setzen Status zurück auf 3 (SupplyChain)
                   newStatus = PROJECT_STATUS.PRUEFUNG_SUPPLY_CHAIN; // Status 3
                 }
                 
                 const updateData = {
                   gesamtmenge: user.role === 'supply_chain' ? newQuantity : project.gesamtmenge,
                   standort_verteilung: locationQuantities,
                   ...(user.role === 'supply_chain' || user.role.startsWith('planung_') ? { status: newStatus } : {})
                 };
                
                await handleCorrection(updateData);
              }}
            >
               <div className="space-y-4">
                 {/* Nur SupplyChain darf Gesamtmenge ändern */}
                 {user.role === 'supply_chain' && (
                   <div>
                     <Label htmlFor="corrected-quantity">Korrigierte Gesamtmenge (kg)</Label>
                     <Input
                       id="corrected-quantity"
                       type="number"
                       value={correctedQuantity}
                       onChange={(e) => setCorrectedQuantity(e.target.value)}
                       min="1"
                       required
                     />
                   </div>
                 )}
                 
                 <div>
                   <Label>Standortverteilung</Label>
                   <div className="grid grid-cols-2 gap-3 mt-2">
                      {Object.keys(locationQuantities).map((key) => {
                        const label = getLocationName(key);
                       // Prüfe ob User standortspezifische Planungsrolle hat
                       const isLocationSpecificPlanning = user.role.startsWith('planung_');
                       const userLocation = isLocationSpecificPlanning ? user.role.replace('planung_', '') : null;
                       const canEditThisLocation = !isLocationSpecificPlanning || userLocation === key;
                       
                       return (
                         <div key={key}>
                           <Label htmlFor={`location-${key}`} className="text-sm">{label}</Label>
                           <Input
                             id={`location-${key}`}
                             type="number"
                             value={locationQuantities[key] || 0}
                             onChange={(e) => setLocationQuantities(prev => ({
                               ...prev,
                               [key]: parseInt(e.target.value) || 0
                             }))}
                             min="0"
                             disabled={!canEditThisLocation}
                             className={!canEditThisLocation ? "bg-muted cursor-not-allowed" : ""}
                           />
                           {!canEditThisLocation && (
                             <p className="text-xs text-muted-foreground mt-1">
                               Nur betroffener Standort kann diese Menge anpassen
                             </p>
                           )}
                         </div>
                       );
                     })}
                   </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="correction-reason">Begründung für die Korrektur</Label>
                    <Textarea
                      id="correction-reason"
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="Beschreiben Sie den Grund für die Korrektur..."
                      rows={3}
                      required
                    />
                  </div>
                </div>
              
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setShowCorrectionDialog(false)}>
                  Abbrechen
                </Button>
                <Button type="submit">
                  Korrektur übernehmen
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Rejection Dialog */}
        <Dialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Projekt ablehnen</DialogTitle>
              <DialogDescription>
                Bitte geben Sie einen Grund für die Ablehnung an.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="rejection-reason">Ablehnungsgrund</Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Beschreiben Sie den Grund für die Ablehnung..."
                  rows={4}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRejectionDialog(false)}>
                Abbrechen
              </Button>
              <Button variant="destructive" onClick={handleRejection}>
                  Projekt absagen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};