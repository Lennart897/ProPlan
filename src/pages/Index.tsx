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
  

  // Mock user for development - will be replaced with Supabase auth
  const mockLogin = () => {
    setUser({
      id: "1",
      email: "admin@projektmanagement.de",
      role: "supply_chain",
      full_name: "Lennart Debbele"
    });
  };

  const handleSignOut = () => {
    setUser(null);
  };

  const handleAuthSuccess = () => {
    // For now, mock a successful login
    mockLogin();
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
        <div className="text-center pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-2">Demo-Zugang:</p>
          <Button variant="outline" onClick={mockLogin} className="w-full">
            Als Demo-User anmelden
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
