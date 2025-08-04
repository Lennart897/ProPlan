import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const authSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(6, "Passwort muss mindestens 6 Zeichen haben"),
});

type AuthFormData = z.infer<typeof authSchema>;

interface AuthFormProps {
  mode: "signin" | "signup";
  onSuccess: () => void;
}

export const AuthForm = ({ mode, onSuccess }: AuthFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: "", password: "" },
  });

  const handleAuth = async (data: AuthFormData) => {
    setIsLoading(true);
    try {
      let error;
      if (mode === "signin") {
        ({ error } = await supabase.auth.signInWithPassword(data));
        if (!error) {
          toast({ title: "Anmeldung erfolgreich", description: "Willkommen zurück!" });
        }
      } else {
        const redirectUrl = `${window.location.origin}/`;
        ({ error } = await supabase.auth.signUp({
          ...data,
          options: { emailRedirectTo: redirectUrl }
        }));
        if (!error) {
          toast({
            title: "Registrierung erfolgreich",
            description: "Überprüfen Sie Ihre E-Mail zur Bestätigung.",
          });
        }
      }
      if (error) throw error;
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Ein Fehler ist aufgetreten",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">
          {mode === "signin" ? "Anmelden" : "Registrieren"}
        </CardTitle>
        <CardDescription className="text-center">
          {mode === "signin"
            ? "Melden Sie sich mit Ihrem Account an"
            : "Erstellen Sie einen neuen Account"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(handleAuth)} className="space-y-4">
          <FormField
            label="E-Mail"
            id="email"
            type="email"
            register={register("email")}
            error={errors.email?.message}
            placeholder="max@beispiel.de"
          />
          <FormField
            label="Passwort"
            id="password"
            type="password"
            register={register("password")}
            error={errors.password?.message}
            placeholder="••••••••"
          />
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading
              ? "Wird verarbeitet..."
              : mode === "signin" ? "Anmelden" : "Registrieren"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

// Extrahiere ein wiederverwendbares Feld
type FieldProps = {
  label: string;
  id: string;
  type?: string;
  register: ReturnType<typeof useForm>["register"];
  error?: string;
  placeholder?: string;
};

function FormField({ label, id, type = "text", register, error, placeholder }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} {...register} autoComplete={id} placeholder={placeholder} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
