
import { useState, useEffect } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Button } from "@/components/ui/button";

interface User {
  id: string;
  email: string;
  role: "vertrieb" | "supply_chain" | "planung";
  full_name?: string;
}

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  

  // Mock users for development - will be replaced with Supabase auth
  const mockUsers = {
    vertrieb: {
      id: "1",
      email: "vertrieb@projektmanagement.de",
      role: "vertrieb" as const,
      full_name: "Max Müller"
    },
    supply_chain: {
      id: "2", 
      email: "supply@projektmanagement.de",
      role: "supply_chain" as const,
      full_name: "Anna Schmidt"
    },
    planung: {
      id: "3",
      email: "planung@projektmanagement.de", 
      role: "planung" as const,
      full_name: "Lennart Debbele"
    }
  };

  const mockLogin = (role: keyof typeof mockUsers) => {
    setUser(mockUsers[role]);
  };

  const handleSignOut = () => {
    setUser(null);
  };

  const handleAuthSuccess = () => {
    // For now, mock a successful login with planung role
    mockLogin("planung");
  };

  if (user) {
    return <Dashboard user={user} onSignOut={handleSignOut} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-info/5 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-primary">Projekt Management</h1>
          <p className="text-muted-foreground">
            Professionelle Projekterfassung und Workflow-Management
          </p>
        </div>
        
        <AuthForm mode="signin" onSuccess={handleAuthSuccess} />

        {/* Demo Login for Testing */}
        <div className="text-center pt-4 border-t space-y-3">
          <p className="text-sm text-muted-foreground mb-2">Demo-Zugang:</p>
          <div className="space-y-2">
            <Button variant="outline" onClick={() => mockLogin("vertrieb")} className="w-full">
              Vertrieb (Max Müller)
            </Button>
            <Button variant="outline" onClick={() => mockLogin("supply_chain")} className="w-full">
              Supply Chain (Anna Schmidt)
            </Button>
            <Button variant="outline" onClick={() => mockLogin("planung")} className="w-full">
              Planung (Lennart Debbele)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
