import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ThemeProvider } from "@/components/theme/theme-provider"

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="proplan-ui-theme">
    <App />
  </ThemeProvider>
);
