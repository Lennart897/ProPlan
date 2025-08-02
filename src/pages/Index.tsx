import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

interface AppUser {
  id: string;
  email: string;
  role: "vertrieb" | "supply_chain" | "planung";
  full_name?: string;
}

const Index = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Mock users for demo - in production this would come from profiles table
  const mockUsers = {
    "vertrieb@demo.com": {
      id: "vertrieb-demo",
      email: "vertrieb@demo.com",
      role: "vertrieb" as const,
      full_name: "Max Müller"
    },
    "supply@demo.com": {
      id: "supply-demo", 
      email: "supply@demo.com",
      role: "supply_chain" as const,
      full_name: "Anna Schmidt"
    },
    "planung@demo.com": {
      id: "planung-demo",
      email: "planung@demo.com", 
      role: "planung" as const,
      full_name: "Lennart Debbele"
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        
        if (session?.user) {
          // For demo purposes, use mock user data based on email
          const mockUser = mockUsers[session.user.email as keyof typeof mockUsers];
          if (mockUser) {
            setUser(mockUser);
          } else {
            // Default to planung role for other emails
            setUser({
              id: session.user.id,
              email: session.user.email || "",
              role: "planung",
              full_name: session.user.user_metadata?.full_name || session.user.email
            });
          }
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const mockUser = mockUsers[session.user.email as keyof typeof mockUsers];
        if (mockUser) {
          setUser(mockUser);
        } else {
          setUser({
            id: session.user.id,
            email: session.user.email || "",
            role: "planung",
            full_name: session.user.user_metadata?.full_name || session.user.email
          });
        }
      }
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Projekt Management</h1>
          <p className="text-gray-600 mt-2">Anmelden um fortzufahren</p>
        </div>
        
        <AuthForm mode="signin" onSuccess={() => {}} />

        {/* Demo Login for Testing */}
        <div className="text-center pt-4 border-t space-y-3">
          <p className="text-sm text-gray-600">Demo Accounts:</p>
          <div className="space-y-2">
            <Button variant="outline" onClick={() => demoLogin("vertrieb@demo.com")} className="w-full">
              Vertrieb (Max Müller)
            </Button>
            <Button variant="outline" onClick={() => demoLogin("supply@demo.com")} className="w-full">
              Supply Chain (Anna Schmidt)
            </Button>
            <Button variant="outline" onClick={() => demoLogin("planung@demo.com")} className="w-full">
              Planung (Lennart Debbele)
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Password für alle Demo Accounts: demo123
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;