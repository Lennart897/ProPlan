import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Lock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { validatePassword, validatePasswordMatch } from "@/utils/passwordValidation";
import { toast } from "sonner";

const passwordResetSchema = z.object({
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben"),
  confirmPassword: z.string().min(1, "Passwort bestätigen ist erforderlich"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwörter stimmen nicht überein",
  path: ["confirmPassword"],
});

type PasswordResetData = z.infer<typeof passwordResetSchema>;

const ResetPassword = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({ isValid: true, errors: [] });
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PasswordResetData>({
    resolver: zodResolver(passwordResetSchema),
  });

  const password = watch("password");

  // Prüfe ob eine gültige Reset-Session vorliegt
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        // Prüfe ob wir uns in einem gültigen Reset-Flow befinden
        const accessToken = searchParams.get('access_token');
        const refreshToken = searchParams.get('refresh_token');
        const type = searchParams.get('type');
        
        if (session || (accessToken && refreshToken && type === 'recovery')) {
          setIsValidSession(true);
        } else {
          setIsValidSession(false);
          toast.error("Ungültiger oder abgelaufener Reset-Link");
          navigate('/');
        }
      } catch (error) {
        console.error('Session check error:', error);
        setIsValidSession(false);
        navigate('/');
      }
    };

    checkSession();
  }, [searchParams, navigate]);

  // Validiere Passwort bei Eingabe
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    if (newPassword) {
      setPasswordValidation(validatePassword(newPassword));
    } else {
      setPasswordValidation({ isValid: true, errors: [] });
    }
  };

  const onSubmit = async (data: PasswordResetData) => {
    setIsLoading(true);

    try {
      // Validiere Passwort
      const validation = validatePassword(data.password);
      if (!validation.isValid) {
        toast.error("Passwort erfüllt nicht die Sicherheitsanforderungen");
        setIsLoading(false);
        return;
      }

      // Prüfe Passwort-Übereinstimmung
      if (!validatePasswordMatch(data.password, data.confirmPassword)) {
        toast.error("Passwörter stimmen nicht überein");
        setIsLoading(false);
        return;
      }

      // Setze neues Passwort
      const { error } = await supabase.auth.updateUser({
        password: data.password
      });

      if (error) {
        toast.error(`Fehler beim Setzen des neuen Passworts: ${error.message}`);
        return;
      }

      toast.success("Passwort erfolgreich zurückgesetzt!");
      
      // Weiterleitung zur Hauptseite nach erfolgreichem Reset
      setTimeout(() => {
        navigate('/');
      }, 2000);

    } catch (error: any) {
      toast.error(`Unerwarteter Fehler: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state während Session-Prüfung
  if (isValidSession === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <p>Lade...</p>
      </div>
    );
  }

  // Fehler-State für ungültige Session
  if (isValidSession === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="apple-card w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Ungültiger Link
            </CardTitle>
            <CardDescription>
              Der Reset-Link ist ungültig oder abgelaufen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              Zurück zur Anmeldung
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4">
            <span className="text-2xl font-bold text-primary-foreground">PP</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">ProPlan</h1>
          <p className="text-sm text-muted-foreground">Neues Passwort setzen</p>
        </div>

        <Card className="apple-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Neues Passwort setzen
            </CardTitle>
            <CardDescription>
              Wählen Sie ein sicheres neues Passwort für Ihr Konto
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Neues Passwort */}
              <div className="space-y-2">
                <Label htmlFor="password">Neues Passwort</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Sicheres Passwort eingeben"
                    {...register("password", {
                      onChange: handlePasswordChange
                    })}
                    className="apple-input pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password.message}</p>
                )}
              </div>

              {/* Passwort bestätigen */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Passwort erneut eingeben"
                    {...register("confirmPassword")}
                    className="apple-input pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>

              {/* Passwort-Validierung Anzeige */}
              {password && !passwordValidation.isValid && (
                <Alert>
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-medium">Passwort-Anforderungen:</p>
                      {passwordValidation.errors.map((error, index) => (
                        <p key={index} className="text-sm">• {error}</p>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Button 
                type="submit" 
                className="w-full apple-button" 
                disabled={isLoading || !passwordValidation.isValid}
              >
                {isLoading ? "Wird gesetzt..." : "Neues Passwort setzen"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;