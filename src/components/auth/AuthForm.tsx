import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
// import { supabase } from "@/integrations/supabase/client"; // Will be enabled when Supabase is fully configured

const authSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(6, "Passwort muss mindestens 6 Zeichen haben"),
  fullName: z.string().min(2, "Name muss mindestens 2 Zeichen haben").optional(),
  role: z.enum(["vertrieb", "supply_chain", "planung"]).optional(),
});

type AuthFormData = z.infer<typeof authSchema>;

interface AuthFormProps {
  mode: "signin" | "signup";
  onSuccess: () => void;
}

export const AuthForm = ({ mode, onSuccess }: AuthFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
      fullName: "",
      role: "vertrieb",
    },
  });

  const onSubmit = async (data: AuthFormData) => {
    setIsLoading(true);
    
    try {
      // Mock authentication for now - will be replaced with Supabase
      console.log("Auth attempt:", { mode, email: data.email, role: data.role });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock success
      toast({
        title: mode === "signup" ? "Registrierung erfolgreich" : "Anmeldung erfolgreich",
        description: mode === "signup" 
          ? "Account wurde erstellt. Sie können sich jetzt anmelden." 
          : "Willkommen zurück!",
      });

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
            : "Erstellen Sie einen neuen Account"
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {mode === "signup" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="fullName">Vollständiger Name</Label>
                <Input
                  id="fullName"
                  {...form.register("fullName")}
                  placeholder="Max Mustermann"
                />
                {form.formState.errors.fullName && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.fullName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Rolle</Label>
                <Select onValueChange={(value) => form.setValue("role", value as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wählen Sie Ihre Rolle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vertrieb">Vertrieb</SelectItem>
                    <SelectItem value="supply_chain">Supply Chain</SelectItem>
                    <SelectItem value="planung">Planung</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.role && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.role.message}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              {...form.register("email")}
              placeholder="max@beispiel.de"
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              {...form.register("password")}
              placeholder="••••••••"
            />
            {form.formState.errors.password && (
              <p className="text-sm text-destructive">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? "Wird verarbeitet..." : mode === "signin" ? "Anmelden" : "Registrieren"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};