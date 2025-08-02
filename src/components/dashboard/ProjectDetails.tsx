import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, Calendar, Package, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  const handleAction = (action: string) => {
    onProjectAction(project.id, action);
    
    const actionLabels = {
      approve: "genehmigt",
      reject: "abgelehnt", 
      correct: "zur Korrektur zurückgewiesen"
    };

    toast({
      title: "Projekt aktualisiert",
      description: `Das Projekt wurde ${actionLabels[action as keyof typeof actionLabels]}.`,
    });
  };

  const getActionButtons = () => {
    switch (user.role) {
      case "supply_chain":
        if (project.status === "pending") {
          return (
            <div className="flex gap-3">
              <Button onClick={() => handleAction("approve")} className="flex-1">
                Zusage erteilen
              </Button>
              <Button variant="outline" onClick={() => handleAction("correct")} className="flex-1">
                Korrektur anfordern
              </Button>
              <Button variant="destructive" onClick={() => handleAction("reject")} className="flex-1">
                Absage erteilen
              </Button>
            </div>
          );
        }
        break;
      case "planung":
        if (project.status === "approved") {
          return (
            <div className="flex gap-3">
              <Button onClick={() => handleAction("approve")} className="flex-1">
                Bestätigen
              </Button>
              <Button variant="outline" onClick={() => handleAction("correct")} className="flex-1">
                Rückgabe
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
    </div>
  );
};