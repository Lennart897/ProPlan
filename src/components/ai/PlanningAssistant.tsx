import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Brain, TrendingUp, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

interface PlanningRequest {
  standort: string;
  produktgruppe: string;
  historischeMengen: number[];
  zeitraum: string;
}

interface AIResponse {
  prognose: string;
  kapazitaetsAnalyse: {
    aktuelleKapazitaet: number;
    benoetigteKapazitaet: number;
    auslastungProzent: number;
  };
  empfehlungen: string[];
  risikoFaktoren: string[];
}

const standorte = [
  { value: "muenchen", label: "München" },
  { value: "berlin", label: "Berlin" },
  { value: "hamburg", label: "Hamburg" },
  { value: "koeln", label: "Köln" },
  { value: "frankfurt", label: "Frankfurt" },
];

const produktgruppen = [
  { value: "metallkomponenten", label: "Metallkomponenten" },
  { value: "elektronik", label: "Elektronikbaugruppen" },
  { value: "kunststoff", label: "Kunststoffteile" },
  { value: "textilien", label: "Textilien" },
];

export const PlanningAssistant = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [planningData, setPlanningData] = useState<PlanningRequest>({
    standort: "",
    produktgruppe: "",
    historischeMengen: [],
    zeitraum: "4-wochen"
  });
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    if (!planningData.standort || !planningData.produktgruppe) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte wählen Sie Standort und Produktgruppe aus.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Mock AI API call - will be replaced with actual Supabase Edge Function
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock AI response
      const mockResponse: AIResponse = {
        prognose: `Standort ${standorte.find(s => s.value === planningData.standort)?.label}: +25% Kapazität erforderlich für die nächsten 4 Wochen`,
        kapazitaetsAnalyse: {
          aktuelleKapazitaet: 1000,
          benoetigteKapazitaet: 1250,
          auslastungProzent: 125
        },
        empfehlungen: [
          "Zusätzliche Schichtarbeit einführen",
          "Temporäre Arbeitskräfte anfordern",
          "Teilproduktion an anderen Standort verlagern",
          "Liefertermine mit Kunden abstimmen"
        ],
        risikoFaktoren: [
          "Erhöhte Auslastung kann zu Qualitätsproblemen führen",
          "Überstunden können Mitarbeiterzufriedenheit beeinträchtigen",
          "Zusätzliche Kosten für temporäre Arbeitskräfte"
        ]
      };

      setAiResponse(mockResponse);

      toast({
        title: "KI-Analyse abgeschlossen",
        description: "Die Planungsprognose wurde erfolgreich erstellt.",
      });

    } catch (error) {
      toast({
        title: "Fehler",
        description: "Fehler bei der KI-Analyse. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (auslastung: number) => {
    if (auslastung <= 80) return "text-success";
    if (auslastung <= 100) return "text-warning";
    return "text-destructive";
  };

  const getStatusIcon = (auslastung: number) => {
    if (auslastung <= 80) return <CheckCircle className="h-5 w-5 text-success" />;
    if (auslastung <= 100) return <AlertTriangle className="h-5 w-5 text-warning" />;
    return <AlertTriangle className="h-5 w-5 text-destructive" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            KI-Planungsassistent
          </CardTitle>
          <CardDescription>
            Erhalten Sie datenbasierte Prognosen und Empfehlungen für Ihre Produktionsplanung
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="standort">Standort</Label>
              <Select 
                value={planningData.standort} 
                onValueChange={(value) => setPlanningData(prev => ({ ...prev, standort: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Standort auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {standorte.map((standort) => (
                    <SelectItem key={standort.value} value={standort.value}>
                      {standort.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="produktgruppe">Produktgruppe</Label>
              <Select 
                value={planningData.produktgruppe} 
                onValueChange={(value) => setPlanningData(prev => ({ ...prev, produktgruppe: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Produktgruppe auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {produktgruppen.map((gruppe) => (
                    <SelectItem key={gruppe.value} value={gruppe.value}>
                      {gruppe.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="zeitraum">Prognosezeitraum</Label>
              <Select 
                value={planningData.zeitraum} 
                onValueChange={(value) => setPlanningData(prev => ({ ...prev, zeitraum: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2-wochen">2 Wochen</SelectItem>
                  <SelectItem value="4-wochen">4 Wochen</SelectItem>
                  <SelectItem value="8-wochen">8 Wochen</SelectItem>
                  <SelectItem value="12-wochen">12 Wochen</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="historische-mengen">Historische Durchschnittsmenge</Label>
              <Input
                id="historische-mengen"
                type="number"
                placeholder="z.B. 800"
                onChange={(e) => setPlanningData(prev => ({ 
                  ...prev, 
                  historischeMengen: [parseInt(e.target.value) || 0] 
                }))}
              />
            </div>
          </div>

          <Button 
            onClick={handleAnalyze} 
            disabled={isLoading || !planningData.standort || !planningData.produktgruppe}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                KI analysiert...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Prognose erstellen
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {aiResponse && (
        <div className="space-y-4">
          {/* Hauptprognose */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                KI-Prognose
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-medium">{aiResponse.prognose}</p>
            </CardContent>
          </Card>

          {/* Kapazitätsanalyse */}
          <Card>
            <CardHeader>
              <CardTitle>Kapazitätsanalyse</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Aktuelle Kapazität</p>
                  <p className="text-2xl font-bold">{aiResponse.kapazitaetsAnalyse.aktuelleKapazitaet}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Benötigte Kapazität</p>
                  <p className="text-2xl font-bold">{aiResponse.kapazitaetsAnalyse.benoetigteKapazitaet}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Auslastung</p>
                  <p className={`text-2xl font-bold flex items-center justify-center gap-2 ${getStatusColor(aiResponse.kapazitaetsAnalyse.auslastungProzent)}`}>
                    {getStatusIcon(aiResponse.kapazitaetsAnalyse.auslastungProzent)}
                    {aiResponse.kapazitaetsAnalyse.auslastungProzent}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Empfehlungen */}
          <Card>
            <CardHeader>
              <CardTitle className="text-success">Empfehlungen</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {aiResponse.empfehlungen.map((empfehlung, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{empfehlung}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Risikofaktoren */}
          <Card>
            <CardHeader>
              <CardTitle className="text-warning">Risikofaktoren</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {aiResponse.risikoFaktoren.map((risiko, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{risiko}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};