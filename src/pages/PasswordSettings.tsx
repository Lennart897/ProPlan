import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PasswordChangeForm } from "@/components/auth/PasswordChangeForm";
import { PasswordResetRequest } from "@/components/auth/PasswordResetRequest";

type ViewMode = "change" | "reset";

const PasswordSettings = () => {
  const [viewMode, setViewMode] = useState<ViewMode>("change");
  const navigate = useNavigate();

  const handleSuccess = () => {
    // Nach erfolgreichem Passwort-Change zurück zur Hauptseite
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4">
            <span className="text-2xl font-bold text-primary-foreground">PP</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">ProPlan</h1>
          <p className="text-sm text-muted-foreground">Passwort-Einstellungen</p>
        </div>

        {/* Mode-Umschaltung */}
        {/* Mode-Umschaltung */}
        <Button
          variant={viewMode === "change" ? "default" : "outline"}
          onClick={() => setViewMode("change")}
          className="w-full mb-3"
        >
          Passwort ändern
        </Button>
        <Button
          variant={viewMode === "reset" ? "default" : "outline"}
          onClick={() => setViewMode("reset")}
          className="w-full mb-3"
        >
          Passwort zurücksetzen per E-Mail
        </Button>

        {/* Entsprechende Komponente anzeigen */}
        {viewMode === "change" && (
          <PasswordChangeForm onSuccess={handleSuccess} />
        )}

        {viewMode === "reset" && (
          <PasswordResetRequest onBack={() => navigate('/')} />
        )}

        {/* Zurück-Button */}
        <Button 
          variant="ghost" 
          onClick={() => navigate('/')}
          className="w-full"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Hauptseite
        </Button>
      </div>
    </div>
  );
};

export default PasswordSettings;