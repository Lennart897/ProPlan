import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const PrivacyPolicy = () => {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Datenschutzerklärung</CardTitle>
          <p className="text-muted-foreground">Stand: {new Date().toLocaleDateString('de-DE')}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Verantwortlicher</h2>
            <p className="mb-4">
              Verantwortlicher für die Datenverarbeitung auf dieser Website ist:
            </p>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="font-medium">[Ihr Unternehmen]</p>
              <p>[Straße und Hausnummer]</p>
              <p>[PLZ Ort]</p>
              <p>E-Mail: [datenschutz@ihrunternehmen.de]</p>
              <p>Telefon: [Ihre Telefonnummer]</p>
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Arten der verarbeiteten Daten</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Bestandsdaten (z.B. Namen, Adressen)</li>
              <li>Kontaktdaten (z.B. E-Mail, Telefonnummern)</li>
              <li>Inhaltsdaten (z.B. Texteingaben, Projektdaten)</li>
              <li>Nutzungsdaten (z.B. besuchte Webseiten, Interesse an Inhalten, Zugriffszeiten)</li>
              <li>Meta-/Kommunikationsdaten (z.B. Geräte-Informationen, IP-Adressen)</li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Zwecke der Verarbeitung</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Bereitstellung unserer Onlinedienste und Nutzerfreundlichkeit</li>
              <li>Auswertung des Nutzungsverhaltens</li>
              <li>Sicherheitsmaßnahmen</li>
              <li>Projektmanagement und Kommunikation</li>
              <li>Geschäftsprozesse und betriebswirtschaftliche Verfahren</li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Rechtsgrundlagen</h2>
            <p className="mb-4">
              Die Verarbeitung Ihrer personenbezogenen Daten erfolgt auf Grundlage folgender Rechtsgrundlagen:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Art. 6 Abs. 1 lit. a DSGVO:</strong> Einwilligung</li>
              <li><strong>Art. 6 Abs. 1 lit. b DSGVO:</strong> Vertragserfüllung</li>
              <li><strong>Art. 6 Abs. 1 lit. c DSGVO:</strong> Rechtliche Verpflichtung</li>
              <li><strong>Art. 6 Abs. 1 lit. f DSGVO:</strong> Berechtigte Interessen</li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Übermittlung an Dritte</h2>
            <p className="mb-4">
              Wir verwenden folgende Drittanbieter für unsere Dienste:
            </p>
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold">Supabase (Datenbank & Authentication)</h3>
                <p>Anbieter: Supabase Inc., USA</p>
                <p>Zweck: Datenspeicherung und Benutzerauthentifizierung</p>
                <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO</p>
                <p>Datenschutz: <a href="https://supabase.com/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">https://supabase.com/privacy</a></p>
              </div>
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Speicherdauer</h2>
            <p className="mb-4">
              Wir speichern personenbezogene Daten nur so lange, wie es für die jeweiligen Zwecke erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Nutzerdaten:</strong> Bis zur Löschung des Accounts</li>
              <li><strong>Projektdaten:</strong> Bis zur Archivierung oder Löschung</li>
              <li><strong>Log-Dateien:</strong> 30 Tage</li>
              <li><strong>Geschäftsdokumentation:</strong> 10 Jahre (HGB)</li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Ihre Rechte</h2>
            <p className="mb-4">Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:</p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Auskunftsrecht</strong> (Art. 15 DSGVO)</li>
              <li><strong>Recht auf Berichtigung</strong> (Art. 16 DSGVO)</li>
              <li><strong>Recht auf Löschung</strong> (Art. 17 DSGVO)</li>
              <li><strong>Recht auf Einschränkung der Verarbeitung</strong> (Art. 18 DSGVO)</li>
              <li><strong>Recht auf Datenübertragbarkeit</strong> (Art. 20 DSGVO)</li>
              <li><strong>Widerspruchsrecht</strong> (Art. 21 DSGVO)</li>
            </ul>
            <p className="mt-4 p-4 bg-primary/10 rounded-lg">
              <strong>Kontakt für Datenschutzanfragen:</strong><br />
              E-Mail: datenschutz@ihrunternehmen.de<br />
              Oder nutzen Sie die Funktionen in Ihrem Benutzerkonto.
            </p>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Beschwerderecht</h2>
            <p>
              Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über unsere Verarbeitung personenbezogener Daten zu beschweren.
            </p>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Änderungen der Datenschutzerklärung</h2>
            <p>
              Wir behalten uns vor, diese Datenschutzerklärung anzupassen, damit sie stets den aktuellen rechtlichen Anforderungen entspricht oder um Änderungen unserer Leistungen in der Datenschutzerklärung umzusetzen.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
};