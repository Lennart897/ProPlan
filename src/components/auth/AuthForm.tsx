import { useState } from "react";
import { useForm, UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Mail, Lock, Loader2 } from "lucide-react";

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
  const [showPassword, setShowPassword] = useState(false);
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
        ({ error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password
        }));
        if (!error) {
          toast({ title: "Anmeldung erfolgreich", description: "Willkommen zurück!" });
        }
      } else {
        const redirectUrl = `${window.location.origin}/`;
        ({ error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
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
    <div className="w-full max-w-md mx-auto">
      <Card className="apple-card border-0 shadow-apple-lg">
        <CardHeader className="space-y-6 p-6 sm:p-8">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {mode === "signin" ? "Willkommen zurück" : "Konto erstellen"}
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground leading-relaxed">
              {mode === "signin"
                ? "Melden Sie sich in Ihrem ProPlan Konto an"
                : "Erstellen Sie Ihr ProPlan Konto"}
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="p-6 sm:p-8 pt-0">
          <form onSubmit={handleSubmit(handleAuth)} className="space-y-5">
            <div className="space-y-4">
              <FormField
                label="E-Mail Adresse"
                id="email"
                type="email"
                register={register("email")}
                error={errors.email?.message}
                placeholder="max@unternehmen.de"
                icon={<Mail className="w-4 h-4" />}
              />
              <FormField
                label="Passwort"
                id="password"
                type={showPassword ? "text" : "password"}
                register={register("password")}
                error={errors.password?.message}
                placeholder="Mindestens 6 Zeichen"
                icon={<Lock className="w-4 h-4" />}
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword(!showPassword)}
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 text-base font-medium apple-button shadow-apple-md hover:shadow-apple-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed" 
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Wird verarbeitet...</span>
                </div>
              ) : (
                mode === "signin" ? "Anmelden" : "Konto erstellen"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// Premium FormField Component
type FieldProps = {
  label: string;
  id: string;
  type?: string;
  register: UseFormRegisterReturn;
  error?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  showPassword?: boolean;
  onTogglePassword?: () => void;
};

function FormField({ 
  label, 
  id, 
  type = "text", 
  register, 
  error, 
  placeholder, 
  icon,
  showPassword,
  onTogglePassword 
}: FieldProps) {
  const isPassword = type === "password" || (type === "text" && onTogglePassword);
  
  return (
    <div className="space-y-2">
      <Label 
        htmlFor={id} 
        className="text-sm font-medium text-foreground block"
      >
        {label}
      </Label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            {icon}
          </div>
        )}
        <Input 
          id={id} 
          type={type} 
          {...register} 
          autoComplete={id === "email" ? "email" : id === "password" ? "current-password" : id}
          placeholder={placeholder}
          className={`
            h-12 text-base apple-input transition-all duration-200
            ${icon ? "pl-10" : "pl-3"}
            ${isPassword ? "pr-12" : "pr-3"}
            ${error ? "border-destructive focus:border-destructive" : ""}
            focus:ring-2 focus:ring-primary/20 focus:border-primary
            placeholder:text-muted-foreground/60
          `}
        />
        {isPassword && onTogglePassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive flex items-center gap-1 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
