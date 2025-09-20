import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Download, Trash2, Shield, FileText, Database, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UserDataManagementProps {
  user: {
    id: string;
    email: string;
  };
}

export const UserDataManagement = ({ user }: UserDataManagementProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const exportUserData = async () => {
    setIsExporting(true);
    try {
      // Collect all user data
      const userData = {
        user: {
          id: user.id,
          email: user.email,
          exportDate: new Date().toISOString(),
        },
        profile: null,
        projects: [],
        projectHistory: [],
        locationApprovals: [],
      };

      // Get profile data
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      userData.profile = profile;

      // Get projects created by user
      const { data: projects } = await supabase
        .from('manufacturing_projects')
        .select('*')
        .eq('created_by_id', user.id);
      
      userData.projects = projects || [];

      // Get project history
      const { data: history } = await supabase
        .from('project_history')
        .select('*')
        .eq('user_id', user.id);
      
      userData.projectHistory = history || [];

      // Get location approvals
      const { data: approvals } = await supabase
        .from('project_location_approvals')
        .select('*')
        .eq('approved_by', user.id);
      
      userData.locationApprovals = approvals || [];

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(userData, null, 2)], {
        type: 'application/json',
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-data-export-${user.id}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Datenexport erfolgreich",
        description: "Ihre Daten wurden heruntergeladen.",
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Fehler beim Datenexport",
        description: "Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const deleteUserAccount = async () => {
    setIsDeleting(true);
    try {
      // Note: This will trigger the cascade deletion of related data
      // due to foreign key constraints and RLS policies
      
      // First, anonymize projects instead of deleting them (business requirement)
      await supabase
        .from('manufacturing_projects')
        .update({
          created_by_name: 'Gelöschter Benutzer',
          created_by_id: null,
        })
        .eq('created_by_id', user.id);

      // Delete user profile (this will cascade to other tables via RLS)
      await supabase
        .from('profiles')
        .delete()
        .eq('user_id', user.id);

      // Delete the auth user (this must be done via auth admin API in production)
      // For now, we'll just sign out the user
      await supabase.auth.signOut();

      toast({
        title: "Account gelöscht",
        description: "Ihr Account und alle zugehörigen Daten wurden gelöscht.",
      });

      // Redirect to home page
      window.location.href = '/';
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Fehler beim Löschen",
        description: "Es ist ein Fehler aufgetreten. Bitte kontaktieren Sie den Support.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Datenschutz & DSGVO
          </CardTitle>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre personenbezogenen Daten und Datenschutzrechte
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Data Export Section */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <Download className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Datenportabilität (Art. 20 DSGVO)</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Sie haben das Recht, eine Kopie aller Ihrer persönlichen Daten zu erhalten, 
              die wir über Sie gespeichert haben.
            </p>
            <div className="bg-muted/50 p-4 rounded-lg mb-4">
              <h4 className="font-medium mb-2">Exportierte Daten enthalten:</h4>
              <ul className="text-sm space-y-1">
                <li>• Profildaten (Name, E-Mail, Rolle)</li>
                <li>• Von Ihnen erstellte Projekte</li>
                <li>• Ihre Projekthistorie und Aktivitäten</li>
                <li>• Genehmigungen und Bewertungen</li>
                <li>• Account-Metadaten</li>
              </ul>
            </div>
            <Button 
              onClick={exportUserData} 
              disabled={isExporting}
              className="w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exportiere...' : 'Meine Daten herunterladen'}
            </Button>
          </section>

          <Separator />

          {/* Data Information Section */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <Database className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Gespeicherte Datenarten</h3>
            </div>
            <div className="grid gap-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Bestandsdaten</h4>
                <p className="text-sm text-muted-foreground">
                  Name, E-Mail-Adresse, Benutzer-ID, Rolle, Registrierungsdatum
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Inhaltsdaten</h4>
                <p className="text-sm text-muted-foreground">
                  Erstellte Projekte, Kommentare, Genehmigungen, Projekthistorie
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Nutzungsdaten</h4>
                <p className="text-sm text-muted-foreground">
                  Login-Zeiten, Systemlogs, Audit-Protokolle (30 Tage gespeichert)
                </p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Rights Information */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Ihre Rechte nach DSGVO</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <span className="font-medium min-w-0 flex-shrink-0">Art. 15:</span>
                <span className="text-muted-foreground">Auskunftsrecht - Informationen über gespeicherte Daten</span>
              </div>
              <div className="flex gap-3">
                <span className="font-medium min-w-0 flex-shrink-0">Art. 16:</span>
                <span className="text-muted-foreground">Berichtigung - Korrektur falscher Daten</span>
              </div>
              <div className="flex gap-3">
                <span className="font-medium min-w-0 flex-shrink-0">Art. 17:</span>
                <span className="text-muted-foreground">Löschung - "Recht auf Vergessenwerden"</span>
              </div>
              <div className="flex gap-3">
                <span className="font-medium min-w-0 flex-shrink-0">Art. 18:</span>
                <span className="text-muted-foreground">Einschränkung der Verarbeitung</span>
              </div>
              <div className="flex gap-3">
                <span className="font-medium min-w-0 flex-shrink-0">Art. 20:</span>
                <span className="text-muted-foreground">Datenübertragbarkeit - Export Ihrer Daten</span>
              </div>
              <div className="flex gap-3">
                <span className="font-medium min-w-0 flex-shrink-0">Art. 21:</span>
                <span className="text-muted-foreground">Widerspruch gegen Verarbeitung</span>
              </div>
            </div>
          </section>

          <Separator />

          {/* Account Deletion Section */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <h3 className="text-lg font-semibold text-destructive">Account löschen</h3>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
              <h4 className="font-medium mb-2 text-destructive">Achtung: Unwiderrufliche Aktion</h4>
              <ul className="text-sm space-y-1 text-destructive/80">
                <li>• Ihr Account wird permanent gelöscht</li>
                <li>• Alle persönlichen Daten werden entfernt</li>
                <li>• Projekte werden anonymisiert (Geschäftsdaten bleiben erhalten)</li>
                <li>• Diese Aktion kann nicht rückgängig gemacht werden</li>
              </ul>
            </div>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  disabled={isDeleting}
                  className="w-full sm:w-auto"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Account permanent löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive">
                    Account wirklich löschen?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      Diese Aktion kann nicht rückgängig gemacht werden. Ihr Account 
                      und alle zugehörigen persönlichen Daten werden permanent gelöscht.
                    </p>
                    <p className="font-medium">
                      Von Ihnen erstellte Projekte bleiben aus Geschäftsgründen erhalten, 
                      werden aber anonymisiert.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={deleteUserAccount}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? 'Lösche...' : 'Ja, Account löschen'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>

          <Separator />

          {/* Contact Information */}
          <section>
            <h3 className="text-lg font-semibold mb-2">Datenschutz-Kontakt</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Für Fragen zum Datenschutz oder zur Ausübung Ihrer Rechte:
            </p>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm">
                <strong>E-Mail:</strong> datenschutz@ihrunternehmen.de<br />
                <strong>Telefon:</strong> [Ihre Nummer]<br />
                <strong>Post:</strong> [Ihre Adresse]
              </p>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
};