import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const resetRequestSchema = z.object({
  email: z.string().email("Bitte geben Sie eine gültige E-Mail-Adresse ein"),
});

type ResetRequestData = z.infer<typeof resetRequestSchema>;

interface PasswordResetRequestProps {
  onBack?: () => void;
  onSuccess?: () => void;
}

export const PasswordResetRequest = ({ onBack, onSuccess }: PasswordResetRequestProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<ResetRequestData>({
    resolver: zodResolver(resetRequestSchema),
  });

  const onSubmit = async (data: ResetRequestData) => {
    setIsLoading(true);

    try {
      // Redirect URL für den Reset-Link
      const redirectTo = `${window.location.origin}/reset-password`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: redirectTo,
      });

      if (error) {
        toast.error(`Fehler beim Senden der Reset-E-Mail: ${error.message}`);
        return;
      }

      setEmailSent(true);
      toast.success("Reset-E-Mail wurde versendet!");
      onSuccess?.();
    } catch (error: any) {
      toast.error(`Unerwarteter Fehler: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <Card className="apple-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-success">
            <Mail className="w-5 h-5" />
            E-Mail versendet
          </CardTitle>
          <CardDescription>
            Prüfen Sie Ihr E-Mail-Postfach
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription>
              Wir haben eine E-Mail mit einem Reset-Link an <strong>{getValues("email")}</strong> gesendet.
              Klicken Sie auf den Link in der E-Mail, um Ihr Passwort zurückzusetzen.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Keine E-Mail erhalten? Prüfen Sie auch Ihren Spam-Ordner.
            </p>
            <Button 
              variant="outline" 
              onClick={() => setEmailSent(false)}
              className="w-full"
            >
              Erneut senden
            </Button>
          </div>

          {onBack && (
            <Button 
              variant="ghost" 
              onClick={onBack}
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Zurück zur Anmeldung
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="apple-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          Passwort zurücksetzen
        </CardTitle>
        <CardDescription>
          Geben Sie Ihre E-Mail-Adresse ein, um einen Reset-Link zu erhalten
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

          <Alert>
            <AlertDescription>
              Sie erhalten eine E-Mail mit einem sicheren Link zum Zurücksetzen Ihres Passworts.
              Der Link ist nur für begrenzte Zeit gültig.
            </AlertDescription>
          </Alert>

          <Button 
            type="submit" 
            className="w-full apple-button" 
            disabled={isLoading}
          >
            {isLoading ? "Wird gesendet..." : "Reset-E-Mail senden"}
          </Button>
        </form>

        {onBack && (
          <Button 
            variant="ghost" 
            onClick={onBack}
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Zurück zur Anmeldung
          </Button>
        )}
      </CardContent>
    </Card>
  );
};