import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { validatePassword, validatePasswordMatch } from "@/utils/passwordValidation";
import { toast } from "sonner";

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Aktuelles Passwort ist erforderlich"),
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

      // Aktualisiere Passwort über Supabase
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
    } catch (error: any) {
      toast.error(`Unerwarteter Fehler: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="apple-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          Passwort ändern
        </CardTitle>
        <CardDescription>
          Ändern Sie Ihr Passwort für erhöhte Sicherheit
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

          <Button 
            type="submit" 
            className="w-full apple-button" 
            disabled={isLoading || !passwordValidation.isValid}
          >
            {isLoading ? "Wird geändert..." : "Passwort ändern"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};