import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { X, Settings, Cookie } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CookiePreferences {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

const DEFAULT_PREFERENCES: CookiePreferences = {
  necessary: true, // Always true, cannot be disabled
  functional: false,
  analytics: false,
  marketing: false,
};

export const CookieConsent = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setShowBanner(true);
    } else {
      const savedPreferences = JSON.parse(consent);
      setPreferences(savedPreferences);
    }
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    localStorage.setItem('cookie-consent', JSON.stringify(prefs));
    localStorage.setItem('cookie-consent-date', new Date().toISOString());
    setPreferences(prefs);
    setShowBanner(false);
    setShowSettings(false);
    
    // Apply preferences
    applyPreferences(prefs);
  };

  const applyPreferences = (prefs: CookiePreferences) => {
    // Remove analytics cookies if not consented
    if (!prefs.analytics) {
      // Clear any analytics cookies here
      document.cookie.split(";").forEach((c) => {
        const eqPos = c.indexOf("=");
        const name = eqPos > -1 ? c.substr(0, eqPos) : c;
        if (name.trim().startsWith('_ga') || name.trim().startsWith('_gt')) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        }
      });
    }
    
    // Remove marketing cookies if not consented
    if (!prefs.marketing) {
      // Clear any marketing cookies here
    }
  };

  const acceptAll = () => {
    const allAccepted: CookiePreferences = {
      necessary: true,
      functional: true,
      analytics: true,
      marketing: true,
    };
    savePreferences(allAccepted);
  };

  const acceptNecessary = () => {
    savePreferences(DEFAULT_PREFERENCES);
  };

  const handlePreferenceChange = (type: keyof CookiePreferences, value: boolean) => {
    if (type === 'necessary') return; // Cannot change necessary cookies
    setPreferences(prev => ({
      ...prev,
      [type]: value
    }));
  };

  if (!showBanner) {
    return null;
  }

  return (
    <>
      {/* Cookie Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur border-t shadow-lg">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Cookie className="w-6 h-6 text-primary mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">Cookie-Einstellungen</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Wir verwenden Cookies, um Ihnen die bestmögliche Erfahrung auf unserer Website zu bieten. 
                  Einige Cookies sind notwendig für den Betrieb der Website, während andere uns helfen, 
                  die Website zu verbessern und Ihnen personalisierte Inhalte anzuzeigen.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={acceptAll} className="bg-primary text-primary-foreground">
                    Alle akzeptieren
                  </Button>
                  <Button variant="outline" onClick={acceptNecessary}>
                    Nur notwendige
                  </Button>
                  <Dialog open={showSettings} onOpenChange={setShowSettings}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Settings className="w-4 h-4 mr-2" />
                        Einstellungen
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Cookie-Einstellungen</DialogTitle>
                        <DialogDescription>
                          Verwalten Sie Ihre Cookie-Präferenzen für diese Website.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-6">
                        {/* Necessary Cookies */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <Label className="text-base font-medium">Notwendige Cookies</Label>
                              <p className="text-sm text-muted-foreground">
                                Diese Cookies sind für die Grundfunktionen der Website erforderlich.
                              </p>
                            </div>
                            <Switch
                              checked={preferences.necessary}
                              disabled={true}
                              aria-label="Notwendige Cookies (immer aktiv)"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Authentifizierung, Sicherheit, Grundfunktionen
                          </p>
                        </div>

                        <Separator />

                        {/* Functional Cookies */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <Label className="text-base font-medium">Funktionale Cookies</Label>
                              <p className="text-sm text-muted-foreground">
                                Verbessern die Funktionalität und Personalisierung der Website.
                              </p>
                            </div>
                            <Switch
                              checked={preferences.functional}
                              onCheckedChange={(checked) => handlePreferenceChange('functional', checked)}
                              aria-label="Funktionale Cookies"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Benutzereinstellungen, Sprachpräferenzen, personalisierte Inhalte
                          </p>
                        </div>

                        <Separator />

                        {/* Analytics Cookies */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <Label className="text-base font-medium">Analyse-Cookies</Label>
                              <p className="text-sm text-muted-foreground">
                                Helfen uns zu verstehen, wie die Website genutzt wird.
                              </p>
                            </div>
                            <Switch
                              checked={preferences.analytics}
                              onCheckedChange={(checked) => handlePreferenceChange('analytics', checked)}
                              aria-label="Analyse-Cookies"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Google Analytics, Nutzungsstatistiken, Leistungsmetriken
                          </p>
                        </div>

                        <Separator />

                        {/* Marketing Cookies */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <Label className="text-base font-medium">Marketing-Cookies</Label>
                              <p className="text-sm text-muted-foreground">
                                Werden für Werbung und personalisierte Inhalte verwendet.
                              </p>
                            </div>
                            <Switch
                              checked={preferences.marketing}
                              onCheckedChange={(checked) => handlePreferenceChange('marketing', checked)}
                              aria-label="Marketing-Cookies"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Werbe-Tracking, personalisierte Anzeigen, Social Media
                          </p>
                        </div>

                        <div className="flex gap-3 pt-4">
                          <Button onClick={() => savePreferences(preferences)} className="flex-1">
                            Einstellungen speichern
                          </Button>
                          <Button variant="outline" onClick={() => setShowSettings(false)}>
                            Abbrechen
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={acceptNecessary}
                className="flex-shrink-0"
                aria-label="Banner schließen"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};