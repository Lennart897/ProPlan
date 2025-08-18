import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { validatePassword, validatePasswordMatch } from "@/utils/passwordValidation";
import { toast } from "sonner";
import { User } from "@supabase/supabase-js";

const passwordChangeSchema = z.object({
  email: z.string().email("Gültige E-Mail-Adresse erforderlich").optional().or(z.literal("")),
  currentPassword: z.string().optional().or(z.literal("")),
  newPassword: z.string().min(8, "Neues Passwort muss mindestens 8 Zeichen haben"),
  confirmPassword: z.string().min(1, "Passwort bestätigen ist erforderlich"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwörter stimmen nicht überein",
  path: ["confirmPassword"],
});

type PasswordChangeData = z.infer<typeof passwordChangeSchema>;

interface PasswordChangeFormProps {
  onSuccess?: () => void;
}

export const PasswordChangeForm = ({ onSuccess }: PasswordChangeFormProps) => {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({ isValid: true, errors: [] });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userCheckLoading, setUserCheckLoading] = useState(true);

  // Prüfe aktuellen User-Status
  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);
      } catch (error) {
        console.error('Fehler beim Laden des Users:', error);
        setCurrentUser(null);
      } finally {
        setUserCheckLoading(false);
      }
    };

    checkUser();

    // Auth-Status-Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<PasswordChangeData>({
    resolver: zodResolver(passwordChangeSchema),
  });

  const newPassword = watch("newPassword");
  const isLoggedIn = !!currentUser;

  // Validiere neues Passwort bei Eingabe
  const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value;
    if (password) {
      setPasswordValidation(validatePassword(password));
    } else {
      setPasswordValidation({ isValid: true, errors: [] });
    }
  };

  const onSubmit = async (data: PasswordChangeData) => {
    setIsLoading(true);

    try {
      // Validiere neues Passwort
      const validation = validatePassword(data.newPassword);
      if (!validation.isValid) {
        toast.error("Passwort erfüllt nicht die Sicherheitsanforderungen");
        setIsLoading(false);
        return;
      }

      // Prüfe Passwort-Übereinstimmung
      if (!validatePasswordMatch(data.newPassword, data.confirmPassword)) {
        toast.error("Passwörter stimmen nicht überein");
        setIsLoading(false);
        return;
      }

      if (isLoggedIn) {
        // Eingeloggte User: Direktes Passwort-Update
        const { error } = await supabase.auth.updateUser({
          password: data.newPassword
        });

        if (error) {
          toast.error(`Fehler beim Ändern des Passworts: ${error.message}`);
          return;
        }

        toast.success("Passwort erfolgreich geändert!");
        reset();
        onSuccess?.();
      } else {
        // Nicht eingeloggte User: E-Mail-Reset-Flow
        if (!data.email) {
          toast.error("E-Mail-Adresse ist erforderlich");
          setIsLoading(false);
          return;
        }

        // Sende Reset-E-Mail
        const redirectTo = `${window.location.origin}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
          redirectTo: redirectTo,
        });

        if (error) {
          toast.error(`Fehler beim Senden der Reset-E-Mail: ${error.message}`);
          return;
        }

        toast.success("Reset-E-Mail wurde versendet! Prüfen Sie Ihr Postfach.");
        reset();
        onSuccess?.();
      }
    } catch (error: any) {
      toast.error(`Unerwarteter Fehler: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (userCheckLoading) {
    return (
      <Card className="apple-card">
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">Lade...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="apple-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          {isLoggedIn ? "Passwort ändern" : "Passwort zurücksetzen"}
        </CardTitle>
        <CardDescription>
          {isLoggedIn 
            ? "Ändern Sie Ihr Passwort für erhöhte Sicherheit"
            : "Geben Sie Ihre E-Mail-Adresse ein, um einen Reset-Link zu erhalten"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* E-Mail-Feld für nicht eingeloggte User */}
          {!isLoggedIn && (
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail-Adresse</Label>
              <Input
                id="email"
                type="email"
                placeholder="ihre.email@beispiel.de"
                {...register("email")}
                className="apple-input"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
          )}

          {/* Eingeloggte User: Komplette Passwort-Änderungs-Form */}
          {isLoggedIn && (
            <>
              {/* Aktuelles Passwort */}
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    placeholder="Ihr aktuelles Passwort eingeben"
                    {...register("currentPassword")}
                    className="apple-input pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.currentPassword && (
                  <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
                )}
              </div>

              {/* Neues Passwort */}
              <div className="space-y-2">
                <Label htmlFor="newPassword">Neues Passwort</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Neues sicheres Passwort eingeben"
                    {...register("newPassword", {
                      onChange: handleNewPasswordChange
                    })}
                    className="apple-input pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.newPassword && (
                  <p className="text-sm text-destructive">{errors.newPassword.message}</p>
                )}
              </div>

              {/* Passwort bestätigen */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Neues Passwort erneut eingeben"
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
              {newPassword && !passwordValidation.isValid && (
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
            </>
          )}

          {/* Info für nicht-eingeloggte User */}
          {!isLoggedIn && (
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                Sie erhalten eine E-Mail mit einem Reset-Link an die angegebene Adresse.
                Folgen Sie dem Link in der E-Mail, um Ihr neues Passwort zu setzen.
              </AlertDescription>
            </Alert>
          )}

          <Button 
            type="submit" 
            className="w-full apple-button" 
            disabled={isLoading || (isLoggedIn && !passwordValidation.isValid)}
          >
            {isLoading 
              ? (isLoggedIn ? "Wird geändert..." : "Wird gesendet...") 
              : (isLoggedIn ? "Passwort ändern" : "Reset-E-Mail senden")
            }
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};