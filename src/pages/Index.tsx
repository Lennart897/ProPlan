import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { Footer } from "@/components/layout/Footer";

interface AppUser {
  id: string;
  email: string;
  role: "vertrieb" | "supply_chain" | "planung" | "planung_storkow" | "planung_brenz" | "planung_gudensberg" | "planung_doebeln" | "planung_visbek" | "admin";
  full_name?: string;
}

const Index = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user profile from profiles table
  const fetchUserProfile = async (userId: string): Promise<AppUser | null> => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('display_name, role, user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      if (!profile) {
        console.warn('No profile found for user:', userId);
        return null;
      }

      // Get user data from auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
        return {
          id: profile.user_id,
          email: authUser?.email || '',
          role: (profile.role as "vertrieb" | "supply_chain" | "planung" | "planung_storkow" | "planung_brenz" | "planung_gudensberg" | "planung_doebeln" | "planung_visbek" | "admin") || 'planung',
          full_name: profile.display_name || authUser?.email || 'Unbekannter Benutzer'
        };
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    const profileFetch = async (sessionUser: User) => {
      try {
        const userProfile = await fetchUserProfile(sessionUser.id);
        if (!mounted) return;
        if (userProfile) {
          setUser(userProfile);
        } else {
          setUser({
            id: sessionUser.id,
            email: sessionUser.email || "",
            role: "planung",
            full_name:
              sessionUser.user_metadata?.full_name || sessionUser.email || "Unbekannter Benutzer",
          });
        }
      } catch (error) {
        console.error("Deferred profile fetch error:", error);
      }
    };

    // Set up auth state listener FIRST (sync-only callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      console.log("Auth state changed:", event, session?.user?.id);

      // Always update session state immediately
      setSession(session);

      if (session?.user && event !== "SIGNED_OUT") {
        const sUser = session.user;
        // Set a minimal user immediately for instant UI response
        setUser((prev) =>
          prev ?? {
            id: sUser.id,
            email: sUser.email || "",
            role: "planung",
            full_name: sUser.user_metadata?.full_name || sUser.email || "Unbekannter Benutzer",
          }
        );
        // Defer any Supabase calls to avoid blocking the callback
        setTimeout(() => profileFetch(sUser), 0);
      } else {
        setUser(null);
      }

      // Never block the UI; end loading here
      setLoading(false);
    });

    // THEN check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Session error:", error);
          if (mounted) setLoading(false);
          return;
        }
        if (!mounted) return;

        setSession(session);
        if (session?.user) {
          const sUser = session.user;
          // Set minimal user immediately
          setUser((prev) =>
            prev ?? {
              id: sUser.id,
              email: sUser.email || "",
              role: "planung",
              full_name: sUser.user_metadata?.full_name || sUser.email || "Unbekannter Benutzer",
            }
          );
          // Defer profile load
          setTimeout(() => profileFetch(sUser), 0);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      // Versuche normal auszuloggen
      await supabase.auth.signOut();
    } catch (error) {
      // Falls Logout fehlschlägt (z.B. Session bereits ungültig),
      // lösche trotzdem den lokalen Auth-Status
      console.warn('Logout failed, clearing local session:', error);
    }
    
    // Stelle sicher, dass der lokale State immer zurückgesetzt wird
    setSession(null);
    setUser(null);
  };

  const demoLogin = async (email: string) => {
    try {
      // First try to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: "demo123"
      });
      
      if (signInError) {
        // If sign in fails, try to create the demo user first
        if (signInError.message.includes("Invalid login credentials")) {
          const redirectUrl = `${window.location.origin}/`;
          
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password: "demo123",
            options: {
              emailRedirectTo: redirectUrl
            }
          });
          
          if (signUpError) {
            console.error("Demo signup error:", signUpError);
            return;
          }
          
          // After signup, try to sign in again
          const { error: retrySignInError } = await supabase.auth.signInWithPassword({
            email,
            password: "demo123"
          });
          
          if (retrySignInError) {
            console.error("Demo login retry error:", retrySignInError);
          }
        } else {
          console.error("Demo login error:", signInError);
        }
      }
    } catch (error) {
      console.error("Demo login process error:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Laden...</p>
      </div>
    );
  }

  if (user) {
    return <Dashboard user={user} onSignOut={signOut} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4">
              <span className="text-2xl font-bold text-primary-foreground">PP</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground">ProPlan</h1>
            <p className="text-sm text-muted-foreground">Anmelden um fortzufahren</p>
          </div>
          
          <AuthForm mode="signin" onSuccess={() => {}} />

          {/* Passwort vergessen Link */}
          <div className="text-center pt-4">
            <Button 
              variant="link" 
              onClick={() => window.location.href = '/password-settings'}
              className="text-sm text-primary hover:underline"
            >
              Passwort vergessen?
            </Button>
          </div>

          {/* Demo Login for Testing */}
          <div className="text-center pt-4 border-t space-y-3">
            <p className="text-sm text-muted-foreground">Demo Accounts:</p>
            <div className="space-y-2">
              <Button variant="outline" onClick={() => demoLogin("vertriebdemo@proplansystem.de")} className="w-full">
                Vertrieb Demo
              </Button>
              <Button variant="outline" onClick={() => demoLogin("supplychaindemo@proplansystem.de")} className="w-full">
                Supply Chain Demo
              </Button>
              <Button variant="outline" onClick={() => demoLogin("planungdemo@proplansystem.de")} className="w-full">
                Planung Demo
              </Button>
              <Button variant="outline" onClick={() => demoLogin("admin@demo.com")} className="w-full">
                Admin Demo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Password für alle Demo Accounts: demo123
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Index;