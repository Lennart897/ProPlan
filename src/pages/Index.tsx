import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

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

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        console.log('Auth state changed:', event, session?.user?.id);
        
        // Always update session state
        setSession(session);
        
        if (session?.user && event !== 'SIGNED_OUT') {
          try {
            const userProfile = await fetchUserProfile(session.user.id);
            if (mounted) {
              if (userProfile) {
                setUser(userProfile);
              } else {
                // Fallback if no profile exists
                setUser({
                  id: session.user.id,
                  email: session.user.email || "",
                  role: "planung",
                  full_name: session.user.user_metadata?.full_name || session.user.email || "Unbekannter Benutzer"
                });
              }
            }
          } catch (error) {
            console.error('Error fetching user profile:', error);
            if (mounted) {
              setUser({
                id: session.user.id,
                email: session.user.email || "",
                role: "planung",
                full_name: session.user.user_metadata?.full_name || session.user.email || "Unbekannter Benutzer"
              });
            }
          }
        } else {
          if (mounted) {
            setUser(null);
          }
        }
        
        if (mounted) {
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          if (mounted) {
            setLoading(false);
          }
          return;
        }

        if (!mounted) return;
        
        setSession(session);
        
        if (session?.user) {
          try {
            const userProfile = await fetchUserProfile(session.user.id);
            if (mounted) {
              if (userProfile) {
                setUser(userProfile);
              } else {
                setUser({
                  id: session.user.id,
                  email: session.user.email || "",
                  role: "planung",
                  full_name: session.user.user_metadata?.full_name || session.user.email || "Unbekannter Benutzer"
                });
              }
            }
          } catch (error) {
            console.error('Error fetching initial user profile:', error);
            if (mounted) {
              setUser({
                id: session.user.id,
                email: session.user.email || "",
                role: "planung",
                full_name: session.user.user_metadata?.full_name || session.user.email || "Unbekannter Benutzer"
              });
            }
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4">
            <span className="text-2xl font-bold text-primary-foreground">PP</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">ProPlan</h1>
          <p className="text-sm text-muted-foreground">Anmelden um fortzufahren</p>
        </div>
        
        <AuthForm mode="signin" onSuccess={() => {}} />

        {/* Demo Login for Testing */}
        <div className="text-center pt-4 border-t space-y-3">
          <p className="text-sm text-muted-foreground">Demo Accounts:</p>
          <div className="space-y-2">
            <Button variant="outline" onClick={() => demoLogin("vertrieb@demo.com")} className="w-full">
              Vertrieb Demo
            </Button>
            <Button variant="outline" onClick={() => demoLogin("supply@demo.com")} className="w-full">
              Supply Chain Demo
            </Button>
            <Button variant="outline" onClick={() => demoLogin("planung@demo.com")} className="w-full">
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
  );
};

export default Index;