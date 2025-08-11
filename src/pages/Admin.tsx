import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const roles = [
  "vertrieb",
  "supply_chain",
  "planung",
  "planung_storkow",
  "planung_brenz",
  "planung_gudensberg",
  "planung_doebeln",
  "planung_visbek",
  "admin",
] as const;

type AppRole = typeof roles[number];

type ListedUser = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  profile: {
    user_id: string;
    display_name: string | null;
    role: AppRole | null;
    created_at: string | null;
    updated_at: string | null;
  } | null;
};

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AppRole>("vertrieb");

  const [users, setUsers] = useState<ListedUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Admin – Benutzerverwaltung";
  }, []);

  // Guard: redirect non-admins
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

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list_users" },
      });
      if (error) throw error;
      setUsers(data?.users || []);
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Konnte Benutzer nicht laden", variant: "destructive" });
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const onCreate = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "create_user",
          email,
          password,
          role,
          display_name: displayName || email,
        },
      });
      if (error) throw error;
      toast({ title: "Erfolgreich", description: "Benutzer wurde erstellt" });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setRole("vertrieb");
      await loadUsers();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Erstellung fehlgeschlagen", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onUpdateRole = async (user_id: string, newRole: AppRole) => {
    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "update_role", user_id, role: newRole },
      });
      if (error) throw error;
      toast({ title: "Aktualisiert", description: "Rolle geändert" });
      await loadUsers();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Rollenänderung fehlgeschlagen", variant: "destructive" });
    }
  };

  const onDelete = async (user_id: string) => {
    if (!confirm("Benutzer wirklich löschen? Dies kann nicht rückgängig gemacht werden.")) return;
    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "delete_user", user_id },
      });
      if (error) throw error;
      toast({ title: "Gelöscht", description: "Benutzer entfernt" });
      await loadUsers();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Löschen fehlgeschlagen", variant: "destructive" });
    }
  };

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-5xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Adminbereich</CardTitle>
            <CardDescription>Benutzerverwaltung (nur für Admins)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Neuen Benutzer anlegen</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">E-Mail</Label>
                  <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" />
                </div>
                <div>
                  <Label htmlFor="password">Passwort</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <div>
                  <Label htmlFor="displayName">Anzeigename</Label>
                  <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Max Mustermann" />
                </div>
                <div>
                  <Label>Rolle</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Rolle wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Button onClick={onCreate} disabled={loading || !email || !password}>Anlegen</Button>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Benutzer</h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>E-Mail</TableHead>
                      <TableHead>Anzeigename</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.email || "—"}</TableCell>
                        <TableCell>{u.profile?.display_name || "—"}</TableCell>
                        <TableCell>
                          <Select value={(u.profile?.role as AppRole) || "vertrieb"} onValueChange={(v) => onUpdateRole(u.id, v as AppRole)}>
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button variant="destructive" size="sm" onClick={() => onDelete(u.id)}>Löschen</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadUsers}>Aktualisieren</Button>
                <Button onClick={() => navigate("/")}>Zurück</Button>
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Admin;
