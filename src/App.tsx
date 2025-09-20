import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import ResetPassword from "./pages/ResetPassword";
import PasswordSettings from "./pages/PasswordSettings";
import CustomerManagement from "./pages/CustomerManagement";
import ArticleManagement from "./pages/ArticleManagement";
import { PrivacyPolicy } from "@/components/legal/PrivacyPolicy";
import { Imprint } from "@/components/legal/Imprint";
import { CookieConsent } from "@/components/legal/CookieConsent";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/customers" element={<CustomerManagement />} />
          <Route path="/articles" element={<ArticleManagement />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/password-settings" element={<PasswordSettings />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/imprint" element={<Imprint />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <CookieConsent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
