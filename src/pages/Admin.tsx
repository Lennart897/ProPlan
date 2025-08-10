import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Admin = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Admin – Benutzerverwaltung";
  }, []);

  // Simple guard: redirect non-admins to home
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return navigate("/");
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.role !== "admin") navigate("/");
    };
    check();
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Adminbereich</CardTitle>
            <CardDescription>Benutzerverwaltung (nur für Admins)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Die Erstellung und Verwaltung von Nutzern wird über eine sichere Edge Function bereitgestellt.
              Bitte hinterlegen Sie den Supabase Service Role Key, damit diese Funktion aktiviert werden kann.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => navigate("/")}>Zurück</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Admin;
