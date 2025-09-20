import { Routes, Route } from "react-router-dom";
import { PrivacyPolicy } from "@/components/legal/PrivacyPolicy";
import { Imprint } from "@/components/legal/Imprint";

export const LegalRoutes = () => {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/imprint" element={<Imprint />} />
    </Routes>
  );
};