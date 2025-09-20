import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, User, Calendar, Package, Building2, Truck, Clock, MapPin, Download, FileText } from "lucide-react";
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
  produktgruppe_2?: string;
  verkaufseinheit?: string;
  grammatur_verkaufseinheit?: number;
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
  attachment_url?: string;
  original_filename?: string;
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
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [correctedQuantity, setCorrectedQuantity] = useState(project.gesamtmenge.toString());
  const [locationQuantities, setLocationQuantities] = useState<Record<string, number>>(
    project.standort_verteilung || {}
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const { toast } = useToast();
  const { getLocationName } = useLocations(true, false);

  const [attachmentUrl, setAttachmentUrl] = useState<string | undefined>(project.attachment_url);
  const [creatorDisplayName, setCreatorDisplayName] = useState<string | null>(null);
  const [articleData, setArticleData] = useState<any>(null);

  useEffect(() => {
    setAttachmentUrl(project.attachment_url);
  }, [project.attachment_url]);

  useEffect(() => {
    if (project.attachment_url) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('manufacturing_projects')
        .select('attachment_url')
        .eq('id', project.id)
        .maybeSingle();
      if (!cancelled && data?.attachment_url) {
        setAttachmentUrl(data.attachment_url as string);
      }
    })();
    return () => { cancelled = true; };
  }, [project.id, project.attachment_url]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!project.created_by_id) { setCreatorDisplayName(null); return; }
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', project.created_by_id)
        .maybeSingle();
      if (!cancelled) {
        setCreatorDisplayName(error ? null : (data?.display_name ?? null));
      }
    })();
    return () => { cancelled = true; };
  }, [project.created_by_id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!project.artikel_nummer) return;
      const { data, error } = await supabase
        .from('articles')
        .select('verkaufseinheit, grammatur_verkaufseinheit')
        .eq('artikel_nummer', project.artikel_nummer)
        .maybeSingle();
      if (!cancelled) {
        setArticleData(error ? null : data);
      }
    })();
    return () => { cancelled = true; };
  }, [project.artikel_nummer]);

  const logProjectAction = async (action: string, oldData?: any, newData?: any, comment?: string) => {
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
            reason: newData?.rejection_reason || newData?.correction_reason || comment || null,
           old_data: action === 'correction' ? JSON.stringify({
             gesamtmenge: oldData?.gesamtmenge,
             standort_verteilung: oldData?.standort_verteilung
           }) : null,
           new_data: action === 'correction' ? JSON.stringify({
             gesamtmenge: newData?.new_gesamtmenge,
             standort_verteilung: newData?.new_standort_verteilung
           }) : null
         });
    } catch (error) {
      console.error('Fehler beim Protokollieren der Aktion:', error);
    }
  };

  const handleAction = async (action: string, comment?: string) => {
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
          const isCreatorRejection = (
            project.status === PROJECT_STATUS.PRUEFUNG_SUPPLY_CHAIN ||
            project.status === PROJECT_STATUS.PRUEFUNG_PLANUNG ||
            project.status === PROJECT_STATUS.GENEHMIGT
          ) && (project.created_by_id === user.id || project.created_by === user.id);
          
          if (isCreatorRejection && project.status === PROJECT_STATUS.GENEHMIGT) {
            // Creator cancellation of approved project: send supply chain rejection email
            console.log('Creator cancellation of approved project - sending supply chain rejection email');
            try {
              await supabase.functions.invoke('send-project-rejection-supply-chain-email', {
                body: {
                  id: project.id,
                  project_number: project.project_number,
                  customer: project.customer,
                  artikel_nummer: project.artikel_nummer,
                  artikel_bezeichnung: project.artikel_bezeichnung,
                  gesamtmenge: project.gesamtmenge,
                  erste_anlieferung: project.erste_anlieferung,
                  letzte_anlieferung: project.letzte_anlieferung,
                  beschreibung: project.beschreibung,
                  standort_verteilung: project.standort_verteilung,
                  created_by_id: project.created_by_id || project.created_by,
                  created_by_name: project.created_by_name,
                  rejection_reason: rejectionReason
                }
              });
              console.log('Supply chain rejection email sent successfully');
            } catch (emailError) {
              console.error('Error sending supply chain rejection email:', emailError);
              // Continue with the rejection even if email fails
            }
            actionType = 'Projektstornierung durch Ersteller';
          } else if (isCreatorRejection) {
            // Creator cancellation: do not send email to the creator; DB trigger handles 5->6 only
            console.log('Creator cancellation detected - skipping email invoke');
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
        await logProjectAction(action, { status: project.status }, updateData, comment);
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
      toast({
        title: "Fehler",
        description: `${action} konnte nicht durchgeführt werden: ${error}`,
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
      }, { 
        ...updateData, 
        correction_reason: correctionReason,
        old_gesamtmenge: project.gesamtmenge,
        new_gesamtmenge: updateData.gesamtmenge || project.gesamtmenge,
        old_standort_verteilung: project.standort_verteilung,
        new_standort_verteilung: updateData.standort_verteilung || project.standort_verteilung
      });

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

  const handleApproval = () => {
    handleAction('approve', approvalComment);
    setShowApprovalDialog(false);
    setApprovalComment("");
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
          produktgruppe_2: project.produktgruppe_2,
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
             <Button key="approve" className="bg-green-600 hover:bg-green-700 text-white w-64" onClick={() => setShowApprovalDialog(true)}>
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
            <Button key="approve" className="bg-green-600 hover:bg-green-700 text-white w-64" onClick={() => setShowApprovalDialog(true)}>
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

    // Allow project creators to cancel projects in status 3, 4, or 5 - regardless of role
    // BUT for vertrieb users in status 4 (PRUEFUNG_PLANUNG): they can ONLY cancel, no other actions
    if (
      (project.status === PROJECT_STATUS.PRUEFUNG_SUPPLY_CHAIN ||
       project.status === PROJECT_STATUS.PRUEFUNG_PLANUNG ||
       project.status === PROJECT_STATUS.GENEHMIGT) &&
      (project.created_by_id === user.id || project.created_by === user.id)
    ) {
      console.log('Creator cancellation button should show:', {
        projectStatus: project.status,
        allowedStatuses: [PROJECT_STATUS.PRUEFUNG_SUPPLY_CHAIN, PROJECT_STATUS.PRUEFUNG_PLANUNG, PROJECT_STATUS.GENEHMIGT],
        projectCreatorId: project.created_by_id,
        projectCreatedBy: project.created_by,
        currentUserId: user.id,
        userRole: user.role
      });
      buttons.push(
        <Button key="creator_reject" variant="destructive" className="w-64" onClick={() => {
          console.log('Creator cancellation button clicked');
          setShowRejectionDialog(true);
        }}>
          Projekt absagen
        </Button>
      );
    }

    // Special case: vertrieb users can ONLY cancel projects in status 4, no other actions allowed
    if (user.role === 'vertrieb' && project.status === PROJECT_STATUS.PRUEFUNG_PLANUNG) {
      // If vertrieb user is NOT the creator, they get no buttons for status 4 projects
      if (!(project.created_by_id === user.id || project.created_by === user.id)) {
        return []; // No actions allowed for vertrieb on status 4 projects they didn't create
      }
      // If they are the creator, the cancellation button was already added above
    }

    return buttons;
  };

  const resolveCreatorName = () => {
    if (creatorDisplayName) return creatorDisplayName;
    const candidate = project.created_by_name || project.created_by || '';
    if (candidate && !candidate.includes('@')) return candidate;
    return 'Unbekannt';
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="default" onClick={onBack} className="mb-4">
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
                    <span>{resolveCreatorName()}</span>
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
            {project.beschreibung && (
              <div className="mt-6">
                <Label className="text-sm font-medium text-muted-foreground">Projektbeschreibung</Label>
                <p className="whitespace-pre-wrap mt-1">{project.beschreibung}</p>
              </div>
            )}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Artikel-Nummer</Label>
                  <p className="font-medium">{project.artikel_nummer}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Artikelbezeichnung</Label>
                  <p className="font-medium">{project.artikel_bezeichnung}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Produktgruppe 1</Label>
                  <p className="font-medium">{project.produktgruppe || "Nicht angegeben"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Produktgruppe 2</Label>
                  <p className="font-medium">{project.produktgruppe_2 || "Nicht angegeben"}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Verkaufseinheit</Label>
                  <p className="font-medium">{articleData?.verkaufseinheit || "Nicht verfügbar"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Grammatur Verkaufseinheit</Label>
                  <p className="font-medium">
                    {articleData?.grammatur_verkaufseinheit != null && articleData?.grammatur_verkaufseinheit !== '' ? 
                      `${Number(articleData.grammatur_verkaufseinheit).toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg` : 
                      "Nicht verfügbar"
                    }
                  </p>
                </div>
              </div>
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
                      <span>{new Date(project.erste_anlieferung).toLocaleDateString("de-DE", { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                    </div>
                  </div>
                )}
                {project.letzte_anlieferung && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Letzte Anlieferung</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{new Date(project.letzte_anlieferung).toLocaleDateString("de-DE", { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attachment */}
        {attachmentUrl && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Anhang
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
onClick={async () => {
                  try {
                    let downloadData: Blob | null = null;
                    let usedPath = attachmentUrl!;

                    const triggerDownload = async (path: string) => {
                      const { data, error } = await supabase.storage
                        .from('project-attachments')
                        .download(path);
                      if (error) throw error;
                      return data as Blob;
                    };

                    const fileName = attachmentUrl!.split('/')?.pop() || '';

                    const tryListAndFind = async (prefix?: string, targetFile?: string): Promise<string | null> => {
                      if (!prefix) return null;
                      const { data: list, error } = await supabase.storage
                        .from('project-attachments')
                        .list(prefix, { limit: 100 });
                      if (error || !list || list.length === 0) return null;
                      const exact = targetFile ? list.find((f) => f.name === targetFile) : null;
                      if (exact) return `${prefix}/${exact.name}`;
                      if (list.length === 1) return `${prefix}/${list[0].name}`;
                      return null;
                    };

                    // 1) Try downloading from current path first
                    try {
                      downloadData = await triggerDownload(attachmentUrl!);
                    } catch (firstErr) {
                      console.log('First download attempt failed, trying alternative paths...');

                      // 2) Try the user-based path (legacy)
                      const userBasedPath = project.created_by_id && fileName
                        ? `${project.created_by_id}/${fileName}`
                        : null;

                      const trySmartSearch = async () => {
                        // 3) Smart search in project folder
                        const discoveredProjectPath = await tryListAndFind(project.id, fileName);
                        if (discoveredProjectPath) {
                          downloadData = await triggerDownload(discoveredProjectPath);
                          usedPath = discoveredProjectPath;
                          return true;
                        }
                        // 4) Smart search in user folder
                        const discoveredUserPath = await tryListAndFind(project.created_by_id, fileName);
                        if (discoveredUserPath) {
                          downloadData = await triggerDownload(discoveredUserPath);
                          usedPath = discoveredUserPath;
                          return true;
                        }
                        return false;
                      };

                      if (userBasedPath) {
                        try {
                          downloadData = await triggerDownload(userBasedPath);
                          usedPath = userBasedPath;
                        } catch {
                          const found = await trySmartSearch();
                          if (!found) throw firstErr;
                        }
                      } else {
                        const found = await trySmartSearch();
                        if (!found) throw firstErr;
                      }
                    }

                    if (downloadData) {
                      // Update DB if we resolved to a different path
                      if (usedPath !== attachmentUrl) {
                        await supabase
                          .from('manufacturing_projects')
                          .update({ attachment_url: usedPath })
                          .eq('id', project.id);
                        setAttachmentUrl(usedPath);
                      }

                      const url = URL.createObjectURL(downloadData);
                      const a = document.createElement('a');
                      a.href = url;
                      // Use original filename if available, otherwise extract from path
                      a.download = project.original_filename || usedPath.split('/')?.pop() || 'anhang';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }
                  } catch (error: any) {
                    toast({
                      title: "Fehler beim Download",
                      description: "Der Anhang konnte nicht gefunden werden. Bitte laden Sie die Datei erneut hoch.",
                      variant: "destructive",
                    });
                  }
                }}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Anhang herunterladen
              </Button>
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
                    <div key={location} className="flex justify-between items-center p-3 bg-primary text-primary-foreground rounded-lg">
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
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto mx-4 w-full sm:w-auto my-8">
            <DialogHeader>
              <DialogTitle>Projekt korrigieren</DialogTitle>
              <DialogDescription>
                Korrigieren Sie die Mengenangaben und Standortverteilung.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                
                 // Validierung: Nur für SupplyChain muss Gesamtmenge mit Standortverteilung übereinstimmen
                 // Planung darf Standortverteilung unabhängig von Gesamtmenge korrigieren
                 const locationSum = Object.values(locationQuantities).reduce((sum, qty) => sum + (qty || 0), 0);
                 const totalQuantity = user.role === 'supply_chain' ? parseInt(correctedQuantity) : project.gesamtmenge;
                 
                 if (user.role === 'supply_chain' && locationSum !== totalQuantity) {
                   toast({
                     title: "Validierungsfehler",
                     description: `Die Summe der Standortmengen (${locationSum.toLocaleString('de-DE')}) muss der Gesamtmenge (${totalQuantity.toLocaleString('de-DE')}) entsprechen.`,
                     variant: "destructive",
                   });
                   return;
                 }
                
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
                <div className="space-y-3">
                  {/* Nur SupplyChain darf Gesamtmenge ändern */}
                  {user.role === 'supply_chain' && (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-muted-foreground text-sm">Aktuelle Gesamtmenge (kg)</Label>
                        <div className="px-3 py-2 bg-muted rounded-md mt-1">
                          <span className="font-medium">{project.gesamtmenge.toLocaleString('de-DE')}</span>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="corrected-quantity" className="text-sm">Neue Gesamtmenge (kg)</Label>
                        <Input
                          id="corrected-quantity"
                          type="text"
                          value={correctedQuantity ? parseInt(correctedQuantity).toLocaleString('de-DE') : ''}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\./g, '');
                            setCorrectedQuantity(value);
                          }}
                          placeholder="z.B. 1.000"
                          required
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}
                 
                 <div>
                   <Label>Standortverteilung</Label>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
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
                              type="text"
                              value={locationQuantities[key] ? locationQuantities[key].toLocaleString('de-DE') : '0'}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\./g, '');
                                setLocationQuantities(prev => ({
                                  ...prev,
                                  [key]: parseInt(value) || 0
                                }));
                              }}
                              placeholder="0"
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
                    
                    {/* Validation indicator */}
                    <div className="mt-3 space-y-2">
                      <Label className="text-sm font-medium">Mengenverteilung Übersicht</Label>
                      
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-background border rounded-lg">
                          <div className="text-xs text-muted-foreground mb-1">Summe Standorte</div>
                          <div className="font-semibold text-lg">
                            {Object.values(locationQuantities).reduce((sum, qty) => sum + (qty || 0), 0).toLocaleString('de-DE')} kg
                          </div>
                        </div>
                        
                        <div className="p-3 bg-background border rounded-lg">
                          <div className="text-xs text-muted-foreground mb-1">Gesamtmenge</div>
                          <div className="font-semibold text-lg">
                            {user.role === 'supply_chain' 
                              ? (correctedQuantity ? parseInt(correctedQuantity).toLocaleString('de-DE') : '0')
                              : project.gesamtmenge.toLocaleString('de-DE')
                            } kg
                          </div>
                        </div>
                      </div>
                      
                       {/* Validation Status */}
                       {(() => {
                         const locationSum = Object.values(locationQuantities).reduce((sum, qty) => sum + (qty || 0), 0);
                         const totalQuantity = user.role === 'supply_chain' ? (parseInt(correctedQuantity) || 0) : project.gesamtmenge;
                         const isValid = user.role === 'supply_chain' ? locationSum === totalQuantity : true; // Planung darf abweichen
                         const isPlanningRole = user.role.startsWith('planung_') || user.role === 'planung';
                         
                         return (
                           <div className={`p-3 rounded-lg border transition-all duration-200 ${
                             isValid 
                               ? 'bg-green-50 border-green-200 text-green-800' 
                               : 'bg-amber-50 border-amber-200 text-amber-800'
                           }`}>
                             <div className="flex items-center gap-2">
                               <span className={`text-lg ${isValid ? 'text-green-600' : 'text-amber-600'}`}>
                                 {isValid ? '✓' : '⚠'}
                               </span>
                               <span className="font-medium">
                                 {isPlanningRole 
                                   ? 'Standortmengen können von Gesamtmenge abweichen'
                                   : isValid 
                                     ? 'Mengen stimmen überein' 
                                     : 'Mengen müssen übereinstimmen'
                                 }
                               </span>
                             </div>
                             {!isValid && !isPlanningRole && (
                               <div className="mt-1 text-sm opacity-80">
                                 Differenz: {Math.abs(locationSum - totalQuantity).toLocaleString('de-DE')} kg
                               </div>
                             )}
                             {isPlanningRole && locationSum !== totalQuantity && (
                               <div className="mt-1 text-sm opacity-80">
                                 Abweichung: {(locationSum - totalQuantity).toLocaleString('de-DE')} kg
                               </div>
                             )}
                           </div>
                         );
                       })()}
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

        {/* Approval Dialog */}
        <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Projekt genehmigen</DialogTitle>
              <DialogDescription>
                Sie können optional einen Kommentar zur Genehmigung hinzufügen.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="approval-comment">Kommentar (optional)</Label>
                <Textarea
                  id="approval-comment"
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  placeholder="Fügen Sie hier einen Kommentar zur Genehmigung hinzu..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
                Abbrechen
              </Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={handleApproval}>
                Projekt genehmigen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};